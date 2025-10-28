// index.js

// โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
// นำเข้า Handlers ที่แยกไฟล์
const { getStaticAnswer } = require('./qa_handler'); 
const { initializeGemini, getAIResponse } = require('./gemini_chat'); 

// -------------------------------------------------------------------
// ดึงค่าคงที่จาก .env
// -------------------------------------------------------------------
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// -------------------------------------------------------------------
// ตั้งค่า Gemini Client
// -------------------------------------------------------------------
if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not set in .env file.");
    process.exit(1);
}
initializeGemini(GEMINI_API_KEY); 

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ====================================================
// 2. Endpoint สำหรับ Webhook Verification (GET /webhook)
// ====================================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400); 
    }
});

// ====================================================
// 3. Endpoint สำหรับรับข้อความ (POST /webhook)
// ====================================================
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(function(entry) {
            if (entry.messaging) {
                 entry.messaging.forEach(function(webhook_event) {
                    const sender_psid = webhook_event.sender.id;
                    
                    if (webhook_event.message) {
                        handleMessage(sender_psid, webhook_event.message);
                    } 
                });
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// ====================================================
// 4. ฟังก์ชันจัดการข้อความ (Hybrid Logic)
// ====================================================
async function handleMessage(sender_psid, received_message) {
    let response;
    
    if (received_message.text && !received_message.is_echo) {
        const userText = received_message.text;

        // 1. ตรวจสอบจาก Static Q&A (Non-AI) ก่อน
        const staticAnswer = getStaticAnswer(userText);

        if (staticAnswer) {
            // Static Response
            console.log(`Response from: Static QA for PSID: ${sender_psid}`);
            response = { 'text': staticAnswer };
        } else {
            // 2. ถ้าไม่พบ ให้ส่งไปให้ Gemini AI (พร้อม History)
            console.log(`Response from: Gemini AI for PSID: ${sender_psid}`);
            try {
                const aiResponse = await getAIResponse(sender_psid, userText);
                response = { 'text': aiResponse };
            } catch (error) {
                console.error("Failed to get AI response:", error.message);
                response = { 'text': 'ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI หรือ API Key ไม่ถูกต้อง' };
            }
        }
    } else {
        // จัดการกรณีเป็น Sticker, รูปภาพ ฯลฯ
        response = {
            'text': 'ผมสามารถตอบได้เฉพาะข้อความตัวอักษรเท่านั้นครับ ลองพิมพ์มาดูนะครับ'
        };
    }
    
    callSendAPI(sender_psid, response);
}

// ====================================================
// 5. ฟังก์ชันส่งข้อความกลับไปยัง Facebook (API)
// ====================================================
function callSendAPI(sender_psid, response) {
    const request_body = {
        'recipient': { 'id': sender_psid },
        'message': response,
        'messaging_type': 'RESPONSE' 
    };

    axios.post('https://graph.facebook.com/v18.0/me/messages', request_body, {
        params: { 'access_token': PAGE_ACCESS_TOKEN }
    })
    .catch(error => {
        console.error('Unable to send message. Facebook API Error:', 
                      error.response ? error.response.data : error.message);
    });
}

// ====================================================
// 6. เริ่มต้นเซิร์ฟเวอร์ Express
// ====================================================
app.listen(PORT, () => console.log(`Webhook server is listening on port ${PORT}`));
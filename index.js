// โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai'); 

// -------------------------------------------------------------------
// ดึงค่าคงที่จาก .env
// -------------------------------------------------------------------
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// -------------------------------------------------------------------
// ตั้งค่า Gemini Client และ Model
// -------------------------------------------------------------------
if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not set in .env file.");
    process.exit(1);
}
const ai = new GoogleGenAI(GEMINI_API_KEY);
const GEMINI_MODEL = 'gemini-2.5-flash'; 

const app = express();

// ใช้ body-parser สำหรับการประมวลผล JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ====================================================
// 1. Endpoint สำหรับ Health Check (GET /)
// ====================================================
app.get('/', (req, res) => {
    res.send('Chatbot server is running and ready for webhook verification!');
});

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
            // โทเค็นไม่ถูกต้อง
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400); // Bad Request
    }
});

// ====================================================
// 3. Endpoint สำหรับรับข้อความ (POST /webhook)
// ====================================================
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(function(entry) {
            // ตรวจสอบว่ามีข้อมูลการรับส่งข้อความหรือไม่
            if (entry.messaging) {
                 entry.messaging.forEach(function(webhook_event) {
                    const sender_psid = webhook_event.sender.id;
                    
                    if (webhook_event.message) {
                        handleMessage(sender_psid, webhook_event.message);
                    } 
                    // คุณสามารถเพิ่มการจัดการ postbacks, optins ฯลฯ ได้ที่นี่
                });
            }
        });

        // ต้องส่งสถานะ 200 กลับไปโดยเร็วที่สุด
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// ====================================================
// 4. ฟังก์ชันจัดการข้อความ (Logic)
// ====================================================
async function handleMessage(sender_psid, received_message) {
    let response;
    
    // ตรวจสอบว่าเป็นข้อความตัวอักษรและไม่ใช่ echo
    if (received_message.text && !received_message.is_echo) {
        const userText = received_message.text;
        console.log(`Sender PSID: ${sender_psid}, User message: ${userText}`);

        // ตรวจสอบคำทักทายเริ่มต้นตามโจทย์ (ตอบกลับแบบรวดเร็ว)
        const textLower = userText.toLowerCase().trim();

        if (textLower === 'สวัสดีครับ' || textLower === 'สวัสดี') {
            response = {
                'text': `สวัสดีเช่นกันครับ! ยินดีที่ได้รู้จักครับ 😊 (Chatbot ตอบเอง)`
            };
            callSendAPI(sender_psid, response);
            return; // หยุดทำงานหลังตอบกลับรวดเร็ว
        }

        // หากไม่ใช่คำทักทายเริ่มต้น ให้ส่งไปให้ Gemini
        try {
            const result = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: userText,
            });

            const geminiResponse = result.text.trim();
            console.log(`Gemini response: ${geminiResponse}`);

            response = {
                'text': geminiResponse
            };

        } catch (error) {
            console.error('Error calling Gemini API:', error.message);
            response = {
                'text': 'ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI หรือ API Key ไม่ถูกต้อง'
            };
        }
    } else {
        // จัดการกรณีเป็น Sticker, รูปภาพ ฯลฯ
        response = {
            'text': 'ผมสามารถตอบได้เฉพาะข้อความตัวอักษรเท่านั้นครับ ลองพิมพ์มาดูนะครับ'
        };
    }
    
    // ส่งข้อความตอบกลับ
    callSendAPI(sender_psid, response);
}

// ====================================================
// 5. ฟังก์ชันส่งข้อความกลับไปยัง Facebook (API)
// ====================================================
function callSendAPI(sender_psid, response) {
    // สร้าง request body
    const request_body = {
        'recipient': { 'id': sender_psid },
        'message': response,
        'messaging_type': 'RESPONSE' 
    };

    // ใช้ axios ส่ง POST Request ไปยัง Messenger Platform
    axios.post('https://graph.facebook.com/v18.0/me/messages', request_body, {
        params: { 'access_token': PAGE_ACCESS_TOKEN }
    })
    .then(() => {
        // console.log('Message sent successfully!');
    })
    .catch(error => {
        // Log ข้อผิดพลาดจาก Facebook API
        console.error('Unable to send message. Facebook API Error:', 
                      error.response ? error.response.data : error.message);
    });
}

// ====================================================
// 6. เริ่มต้นเซิร์ฟเวอร์ Express
// ====================================================
app.listen(PORT, () => console.log(`Webhook server is listening on port ${PORT}`));
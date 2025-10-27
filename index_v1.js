// โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // ใช้ axios แทน request

// ดึงค่าคงที่จาก .env
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000; // ใช้ค่า 3000 หรือค่า default อื่น

const app = express();

// ใช้ body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ----------------------------------------------------
// 1. Endpoint สำหรับ Health Check
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send('Chatbot server is running!');
});

// ----------------------------------------------------
// 2. Endpoint สำหรับ Webhook Verification (GET)
// ----------------------------------------------------
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
        res.sendStatus(400); // Bad Request
    }
});

// ----------------------------------------------------
// 3. Endpoint สำหรับรับข้อความ (POST)
// ----------------------------------------------------
app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(function(entry) {
            const webhook_event = entry.messaging[0];
            const sender_psid = webhook_event.sender.id;
            
            if (webhook_event.message) {
                handleMessage(sender_psid, webhook_event.message);
            } 
        });

        // ต้องส่งสถานะ 200 กลับไปโดยเร็วที่สุด
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// ----------------------------------------------------
// 4. ฟังก์ชันจัดการข้อความ (Logic)
// ----------------------------------------------------
function handleMessage(sender_psid, received_message) {
    let response;
    
    if (received_message.text) {
        let text = received_message.text.toLowerCase().trim();

        // ตรรกะ: ถ้าทัก "สวัสดีครับ" หรือ "สวัสดี" ให้ตอบกลับว่า "สวัสดีเช่นกัน"
        if (text.includes('สวัสดีครับ') || text.includes('สวัสดี')) {
            response = {
                'text': `สวัสดีเช่นกันครับ! ยินดีที่ได้รู้จักครับ 😊`
            };
        } else {
            // ข้อความตอบกลับทั่วไป
            response = {
                'text': `คุณพิมพ์ว่า: "${received_message.text}" ผมยังไม่เข้าใจคำสั่งนี้ครับ`
            };
        }
    }  
    
    // ส่งข้อความตอบกลับ
    callSendAPI(sender_psid, response);
}

// ----------------------------------------------------
// 5. ฟังก์ชันส่งข้อความกลับไปยัง Facebook (API)
// ----------------------------------------------------
function callSendAPI(sender_psid, response) {
    // สร้าง request body
    const request_body = {
        'recipient': { 'id': sender_psid },
        'message': response,
        'messaging_type': 'RESPONSE' // กำหนดประเภทการส่งข้อความ
    };

    // ใช้ axios ส่ง POST Request ไปยัง Messenger Platform
    axios.post('https://graph.facebook.com/v24.0/me/messages', request_body, {
        params: { 'access_token': PAGE_ACCESS_TOKEN }
    })
    .then(() => {
        console.log('Message sent successfully!');
    })
    .catch(error => {
        // Log ข้อผิดพลาดจาก Facebook API
        console.error('Unable to send message:', error.response ? error.response.data : error.message);
    });
}

// ----------------------------------------------------
// 6. เริ่มต้นเซิร์ฟเวอร์ Express
// ----------------------------------------------------
app.listen(PORT, () => console.log(`Webhook server is listening on port ${PORT}`));
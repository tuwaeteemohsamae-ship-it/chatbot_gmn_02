// gemini_chat.js

const { GoogleGenAI } = require('@google/genai');

let ai;
const GEMINI_MODEL = 'gemini-2.5-flash';

// In-memory storage: { psid: chatSessionObject }
const chatSessions = new Map(); 

/**
 * ฟังก์ชันเริ่มต้น Gemini Client ด้วย API Key
 * @param {string} apiKey Gemini API Key
 */
function initializeGemini(apiKey) {
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing for Gemini initialization.");
    }
    ai = new GoogleGenAI(apiKey);
    console.log("Gemini client initialized.");
}

/**
 * ดึง Chat Session สำหรับ PSID นั้น หรือสร้างใหม่หากไม่มี (พร้อม System Instruction)
 * @param {string} psid Page-Scoped User ID
 * @returns {object} Chat Session Object
 */
function getOrCreateChatSession(psid) {
    if (chatSessions.has(psid)) {
        return chatSessions.get(psid);
    }

    // สร้าง Chat Session ใหม่ พร้อม System Instruction เพื่อกำหนดบทบาทและภาษา
    const chat = ai.chats.create({
        model: GEMINI_MODEL,
        config: {
            systemInstruction: "คุณคือผู้ช่วย Chatbot ที่เป็นมิตร มีความรู้ในทุกด้าน และตอบกลับข้อความด้วยภาษาไทยที่สุภาพ เน้นให้คำตอบสั้น กระชับ และตรงประเด็น"
        }
    });

    chatSessions.set(psid, chat);
    console.log(`New chat session created for PSID: ${psid}`);
    return chat;
}

/**
 * ส่งข้อความไปให้ Gemini และรักษาประวัติการสนทนา
 * @param {string} psid Page-Scoped User ID
 * @param {string} userText ข้อความจากผู้ใช้
 * @returns {Promise<string>} คำตอบจาก Gemini
 */
async function getAIResponse(psid, userText) {
    try {
        const chat = getOrCreateChatSession(psid);
        const result = await chat.sendMessage({ message: userText });
        return result.text;
    } catch (error) {
        console.error('Error sending message to Gemini:', error.message);
        // หากเกิดข้อผิดพลาดรุนแรง อาจลบ Session ทิ้งเพื่อให้เริ่มต้นใหม่ได้
        chatSessions.delete(psid); 
        throw new Error('ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
    }
}

module.exports = { initializeGemini, getAIResponse };
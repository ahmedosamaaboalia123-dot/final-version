const jwt = require("jsonwebtoken");
const prisma = require("../../lib/prisma");
const { jwtSecret } = require("../../config/env");
const { chatWithAssistant } = require("./chat.service");

// ============================================================
// Optional auth: if a valid ACTIVE staff token with at least one
// page permission is present, enable staff tools. Public users
// (customers) still get general chat + menu info.
// ============================================================

const resolveOptionalUser = async (req) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return null;
    }

    let decoded;

    try {
        decoded = jwt.verify(token, jwtSecret);
    } catch {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: {
            id: decoded.sub || decoded.userId,
        },
        select: {
            id: true,
            status: true,
            role: true,
        },
    });

    if (!user || user.status !== "ACTIVE") {
        return null;
    }

    if (user.role === "DELEGATE") {
        return null;
    }

    return {
        id: user.id,
        userId: user.id,
    };
};

const chat = async (req, res, next) => {
    try {
        const user = await resolveOptionalUser(req);

        const result = await chatWithAssistant({
            messages: req.body.messages,
            isStaff: Boolean(user),
        });

        res.status(200).json({
            success: true,
            data: {
                reply: result.content,
                isStaff: Boolean(user),
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    chat,
};
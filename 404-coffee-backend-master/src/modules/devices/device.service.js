const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Register a new device
const registerDevice = async ({ userId, name, deviceFingerprint, deviceInfo }) => {
    if (!deviceFingerprint) throw httpError("deviceFingerprint is required");

    const existing = await prisma.employeeDevice.findUnique({
        where: { deviceFingerprint },
    });

    if (existing) {
        if (existing.userId === userId) return existing;
        throw httpError("This device is already registered to another user", 409);
    }

    const device = await prisma.employeeDevice.create({
        data: {
            userId,
            name: name || "Unknown Device",
            deviceFingerprint,
            deviceInfo: deviceInfo || null,
            status: "PENDING",
        },
    });

    return device;
};

// List devices for a user
const getUserDevices = async (userId) => {
    return prisma.employeeDevice.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
};

// Approve a pending device
const approveDevice = async (userId, deviceId, approvedByUserId) => {
    const device = await prisma.employeeDevice.findFirst({
        where: { id: Number(deviceId), userId: Number(userId) },
    });

    if (!device) throw httpError("Device not found", 404);
    if (device.status !== "PENDING") throw httpError("Device is not pending approval");

    return prisma.employeeDevice.update({
        where: { id: device.id },
        data: {
            status: "APPROVED",
            approvedByUserId,
            approvedAt: new Date(),
        },
    });
};

// Reject a pending device
const rejectDevice = async (userId, deviceId, approvedByUserId) => {
    const device = await prisma.employeeDevice.findFirst({
        where: { id: Number(deviceId), userId: Number(userId) },
    });

    if (!device) throw httpError("Device not found", 404);
    if (device.status !== "PENDING") throw httpError("Device is not pending approval");

    return prisma.employeeDevice.update({
        where: { id: device.id },
        data: {
            status: "REJECTED",
            rejectedAt: new Date(),
        },
    });
};

// Revoke an approved device
const revokeDevice = async (userId, deviceId) => {
    const device = await prisma.employeeDevice.findFirst({
        where: { id: Number(deviceId), userId: Number(userId) },
    });

    if (!device) throw httpError("Device not found", 404);

    return prisma.employeeDevice.update({
        where: { id: device.id },
        data: { status: "REVOKED" },
    });
};

// Block an approved device
const blockDevice = async (userId, deviceId) => {
    const device = await prisma.employeeDevice.findFirst({
        where: { id: Number(deviceId), userId: Number(userId) },
    });

    if (!device) throw httpError("Device not found", 404);

    return prisma.employeeDevice.update({
        where: { id: device.id },
        data: { status: "BLOCKED" },
    });
};

// Check if a device is approved (used in login flow)
const checkDeviceStatus = async (deviceFingerprint) => {
    if (!deviceFingerprint) return { status: "NOT_FOUND", deviceReviewRequired: false };

    const device = await prisma.employeeDevice.findUnique({
        where: { deviceFingerprint },
    });

    if (!device) return { status: "NOT_FOUND", deviceReviewRequired: true };
    return { status: device.status, deviceReviewRequired: false, device };
};

module.exports = {
    registerDevice,
    getUserDevices,
    approveDevice,
    rejectDevice,
    revokeDevice,
    blockDevice,
    checkDeviceStatus,
};

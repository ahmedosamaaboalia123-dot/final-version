const prisma = require("../../lib/prisma");

const { createAuditLog } = require("../../utils/audit");

// ============================================================
// Get all settings (as a key => value map)
// ============================================================

const getSettings = async () => {
    const settings = await prisma.setting.findMany({
        orderBy: {
            key: "asc",
        },
    });

    const result = {};

    for (const setting of settings) {
        result[setting.key] = setting.value;
    }

    return result;
};

// ============================================================
// Update single setting
// ============================================================

const updateSetting = async (key, data, userId, ipAddress) => {
    if (!key) {
        const error = new Error("Setting key is required");
        error.statusCode = 400;
        throw error;
    }

    const { value, description } = data;

    const setting = await prisma.setting.upsert({
        where: {
            key,
        },
        update: {
            ...(value !== undefined && { value: String(value) }),
            ...(description !== undefined && { description }),
            updatedByUserId: userId,
        },
        create: {
            key,
            value: value !== undefined ? String(value) : null,
            description: description || null,
            updatedByUserId: userId,
        },
    });

    await createAuditLog({
        userId,
        page: "settings",
        action: "update_settings",
        description: `Setting "${key}" updated`,
        ipAddress,
    });

    return setting;
};

// ============================================================
// Update multiple settings (bulk)
// ============================================================

const updateSettingsBulk = async (data, userId, ipAddress) => {
    const { settings } = data;

    if (!settings || typeof settings !== "object") {
        const error = new Error("Settings object is required");
        error.statusCode = 400;
        throw error;
    }

    const entries = Object.entries(settings);

    if (entries.length === 0) {
        const error = new Error("No settings provided");
        error.statusCode = 400;
        throw error;
    }

    let count = 0;

    for (const [key, value] of entries) {
        const existing = await prisma.setting.findUnique({
            where: {
                key,
            },
        });

        if (existing) {
            await prisma.setting.update({
                where: {
                    key,
                },
                data: {
                    value: value !== undefined ? String(value) : existing.value,
                    updatedByUserId: userId,
                },
            });
        } else {
            await prisma.setting.create({
                data: {
                    key,
                    value: value !== undefined ? String(value) : null,
                    updatedByUserId: userId,
                },
            });
        }

        count += 1;
    }

    await createAuditLog({
        userId,
        page: "settings",
        action: "update_settings",
        description: `Updated ${count} settings`,
        ipAddress,
    });

    return getSettings();
};

// ============================================================
// Get single setting by key
// ============================================================

const getSettingByKey = async (key) => {
    if (!key) return null;
    const setting = await prisma.setting.findUnique({ where: { key } });
    return setting;
};

module.exports = {
    getSettings,
    getSettingByKey,
    updateSetting,
    updateSettingsBulk,
};

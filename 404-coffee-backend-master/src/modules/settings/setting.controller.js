const settingService = require("./setting.service");

// ============================================================
// Get all settings
// ============================================================

const getSettings = async (req, res, next) => {
    try {
        const settings = await settingService.getSettings();

        res.status(200).json({
            success: true,
            data: settings,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get single setting by key
// ============================================================

const getSettingByKey = async (req, res, next) => {
    try {
        const setting = await settingService.getSettingByKey(req.params.key);
        if (!setting) {
            return res.status(404).json({ success: false, message: "Setting not found" });
        }
        res.status(200).json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update single setting
// ============================================================

const updateSetting = async (req, res, next) => {
    try {
        const setting = await settingService.updateSetting(
            req.params.key,
            req.body,
            req.user.userId,
            req.ip
        );

        res.status(200).json({
            success: true,
            message: "Setting updated successfully",
            data: setting,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update multiple settings
// ============================================================

const updateSettingsBulk = async (req, res, next) => {
    try {
        const settings = await settingService.updateSettingsBulk(
            req.body,
            req.user.userId,
            req.ip
        );

        res.status(200).json({
            success: true,
            message: "Settings updated successfully",
            data: settings,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSettings,
    getSettingByKey,
    updateSetting,
    updateSettingsBulk,
};

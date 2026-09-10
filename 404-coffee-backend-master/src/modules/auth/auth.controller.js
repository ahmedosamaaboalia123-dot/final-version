const authService = require("./auth.service");

const { logAudit } = require("../../utils/audit");

const loginUser = async (req, res, next) => {
    try {
        const result = await authService.loginUser(req.body);

        await logAudit(
            req,
            "auth",
            "login",
            `User ${req.body.name} logged in`
        );

        const isPending = result.pendingDeviceApproval === true;

        res.status(isPending ? 200 : 200).json({
            success: true,
            message: isPending ? "الجهاز في انتظار موافقة المدير" : "تم تسجيل الدخول بنجاح",
            data: result,
        });
    } catch (error) {
        if (error.code === "DEVICE_BLOCKED") {
            return res.status(403).json({
                success: false,
                message: error.message,
                code: error.code,
            });
        }
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const result = await authService.getMe(req.user.userId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const token = req.body.refreshToken;
        const result = await authService.refreshToken(token);
        res.status(200).json({ success: true, message: "تم تجديد الجلسة", data: result });
    } catch (error) {
        if (error.code === "SESSION_EXPIRED") {
            return res.status(401).json({
                success: false,
                message: error.message,
                code: error.code,
            });
        }
        next(error);
    }
};

const logoutUser = async (req, res, next) => {
    try {
        const { refreshToken } = req.body || {};
        const sessionId = req.user.sessionId;
        await authService.logoutUser(req.user.userId, refreshToken, sessionId);
        await logAudit(req, "auth", "logout", `User ${req.user.userId} logged out`);
        res.status(200).json({ success: true, message: "تم تسجيل الخروج بنجاح" });
    } catch (error) {
        next(error);
    }
};

const logoutAll = async (req, res, next) => {
    try {
        await authService.logoutAllDevices(req.user.userId);
        await logAudit(req, "auth", "logout_all", `User ${req.user.userId} logged out from all devices`);
        res.status(200).json({ success: true, message: "تم تسجيل الخروج من جميع الأجهزة" });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    loginUser,
    getMe,
    refreshToken,
    logoutUser,
    logoutAll,
}

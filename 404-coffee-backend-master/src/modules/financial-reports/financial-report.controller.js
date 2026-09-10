const financialReportService = require("./financial-report.service");

// ============================================================
// Sales report
// ============================================================

const getSalesReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getSalesReport(
            req.query
        );

        res.status(200).json({
            success: true,
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Profit report
// ============================================================

const getProfitReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getProfitReport(
            req.query
        );

        res.status(200).json({
            success: true,
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Treasury report
// ============================================================

const getTreasuryReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getTreasuryReport(
            req.query
        );

        res.status(200).json({
            success: true,
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

const getOverviewReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getOverviewReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getInventoryReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getInventoryReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getDailyReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getDailyReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getMonthlyReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getMonthlyReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getShiftReports = async (req, res, next) => {
    try {
        const report = await financialReportService.getShiftReports(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getProductReports = async (req, res, next) => {
    try {
        const report = await financialReportService.getProductReports(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const getInventoryLossReport = async (req, res, next) => {
    try {
        const report = await financialReportService.getInventoryLossReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};
const exportReport = async (req, res, next) => {
    try {
        const report = await financialReportService.exportReport(req.query);
        res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
};

module.exports = {
    getSalesReport,
    getProfitReport,
    getTreasuryReport,
    getOverviewReport,
    getInventoryReport,
    getDailyReport,
    getMonthlyReport,
    getShiftReports,
    getProductReports,
    getInventoryLossReport,
    exportReport,
};

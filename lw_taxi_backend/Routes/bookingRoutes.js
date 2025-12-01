const express = require("express");
const router = express.Router();
const authMiddleware = require("../Middleware/authMiddleware");
const bookingController = require("../Controllers/bookingController");


router.get("/history/all", authMiddleware, bookingController.getUserBookings);
router.get("/admin/all", authMiddleware, bookingController.getAllBookings);


router.get("/:bookingId", authMiddleware, bookingController.getBookingStatus);
router.patch("/:bookingId/status", authMiddleware, bookingController.updateBookingStatus);
router.patch("/:bookingId/cancel", authMiddleware, bookingController.cancelBooking);
router.patch("/:bookingId/payment", authMiddleware, bookingController.updatePaymentStatus); 
router.post("/", authMiddleware, bookingController.createBooking);

module.exports = router;
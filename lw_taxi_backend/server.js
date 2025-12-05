const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const Driver = require("./Models/Driver");
const Booking = require("./Models/Booking");
const User = require("./Models/User");

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());


app.use("/api/auth", require("./Routes/authRoutes"));
app.use("/api/drivers", require("./Routes/driverRoutes"));
app.use("/api/bookings", require("./Routes/bookingRoutes"));
app.use("/api/users", require("./Routes/userRoutes"));

app.get("/", (req, res) => res.send(" Taxi Management System API Running!"));

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  },
});
app.set("io", io);


io.on("connection", (socket) => {
  console.log(" Socket connected:", socket.id);

  socket.on("user_connect", async (userId) => {
    if (!userId) {
      return console.warn(" user_connect missing userId");
    }
    
    try {
      console.log(" User connected:", userId);
      const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { socketId: socket.id },
        { new: true }
      );
      console.log("User socket saved:", updatedUser?._id, socket.id);
    } catch (err) {
      console.error(" User socket save error:", err.message);
    }
  });


  socket.on("disconnect", async () => {
    console.log(" Socket disconnected:", socket.id);
    try {
      const users = await User.find({ socketId: socket.id });
      for (const user of users) {
        await User.findByIdAndUpdate(user._id, { socketId: null });
        console.log("Cleared socket for user:", user._id);
      }
    } catch (err) {
      console.error(" Disconnect cleanup error:", err.message);
    }
  });


  socket.on("driver_online", async (driverId) => {
    if (!driverId) return console.warn("driver_online event missing driverId", socket.id);
    try {
      const updatedDriver = await Driver.findByIdAndUpdate(
        driverId,
        { socketId: socket.id, status: "AVAILABLE", isAvailable: true, lastSeen: new Date() },
        { new: true }
      );
      if (updatedDriver) {
        console.log(`🟢 Driver ${updatedDriver.name}(${driverId}) is AVAILABLE`);
        io.emit("driver_status_update", {
          driverId: updatedDriver._id,
          status: updatedDriver.status,
          isAvailable: updatedDriver.isAvailable
        });
      }
    } catch (err) {
      console.error(" Error in driver_online:", err.message);
    }
  });


  socket.on("accept_booking", async ({ bookingId, driverId }) => {
    try {
      if (!bookingId || !driverId) {
        return console.warn(" accept_booking missing bookingId or driverId");
      }

      console.log("Driver accepting booking:", bookingId);

      const booking = await Booking.findById(bookingId).populate("user assigned_driver");
      if (!booking) {
        return console.error(" accept_booking: booking not found");
      }

      booking.assigned_driver = driverId;
      booking.status = "DRIVER_ASSIGNED";
      await booking.save();

      const updatedDriver = await Driver.findByIdAndUpdate(
        driverId,
        { status: "BUSY", isAvailable: false },
        { new: true }
      );


      const userSocketId = booking.user?.socketId;
      if (userSocketId) {
        console.log(" Sending to user socket:", userSocketId);
        io.to(userSocketId).emit("booking_confirmed", {
          booking: booking._doc,
          driver: updatedDriver,
          message: `Driver ${updatedDriver?.name} accepted your ride!`
        });
      }

  
      io.emit("booking_status_update", { 
        bookingId: booking._id, 
        status: booking.status,
        booking: booking 
      });
      
      io.emit("driver_status_update", { 
        driverId, 
        status: "BUSY", 
        isAvailable: false 
      });

      console.log(" Booking confirmed! Status:", booking.status);

    } catch (err) {
      console.error(" Error accepting booking:", err.message);
    }
  });


  socket.on("reject_booking", async ({ bookingId, driverId }) => {
    try {
      if (!bookingId || !driverId) {
        return console.warn(" reject_booking missing bookingId or driverId");
      }

      const booking = await Booking.findById(bookingId).populate("user assigned_driver");
      if (!booking) {
        return console.error(" reject_booking: booking not found");
      }

      await Driver.findByIdAndUpdate(driverId, { status: "AVAILABLE", isAvailable: true });

      const nextDriver = await Driver.findOne({
        isAvailable: true,
        status: "AVAILABLE",
        socketId: { $exists: true, $ne: null },
        _id: { $ne: driverId }
      }).sort({ lastSeen: -1 });

      if (nextDriver) {
        booking.assigned_driver = nextDriver._id;
        booking.status = "DRIVER_PENDING";
        await booking.save();
        nextDriver.isAvailable = false;
        await nextDriver.save();
        if (nextDriver.socketId) {
          io.to(nextDriver.socketId).emit("new_ride_request", { 
            ...booking.toObject(), 
            user: booking.user 
          });
        }
      } else {
        booking.status = "NO_DRIVER_AVAILABLE";
        booking.assigned_driver = null;
        await booking.save();
      }


      io.emit("booking_status_update", { 
        bookingId: booking._id, 
        status: booking.status,
        booking: booking 
      });
    } catch (err) {
      console.error(" Error in reject_booking:", err.message);
    }
  });
});


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log(" MongoDB Connected"))
  .catch((err) => console.error(" MongoDB Connection Error:", err));


const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🔌 Socket.IO ready for connections");
});
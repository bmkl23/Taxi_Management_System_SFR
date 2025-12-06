import React, { useState } from "react";
import { Card, CardContent, Typography, TextField, Button } from "@mui/material";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = "https://taxibackend-two.vercel.app";

export default function LoginPopup({ switchToRegister, handleCloseLogin }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      let response;

      // Try driver login first
      try {
        response = await axios.post(`${API_URL}/api/drivers/login`, form);
        
        // Driver login successful
        const { token, driver } = response.data;
        
        if (!token || !driver) {
          throw new Error("Invalid response from driver login");
        }

        // Save to localStorage
        localStorage.setItem("token", token);
        localStorage.setItem("userId", driver._id);
        localStorage.setItem("userName", driver.name);
        localStorage.setItem("role", "DRIVER");
        localStorage.setItem("userRole", "DRIVER");

        // Set axios default header
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        setMessage("Login Successful");
        handleCloseLogin();
        navigate("/driver-dashboard");
        return;
      } catch (driverError) {
        // Driver login failed, try user login
        try {
          response = await axios.post(`${API_URL}/api/auth/login`, form);
          
          const { token, user } = response.data;

          if (!token || !user) {
            throw new Error("Invalid response from user login");
          }

          // Save to localStorage
          localStorage.setItem("token", token);
          localStorage.setItem("userId", user._id || user.id);
          localStorage.setItem("userName", user.name);
          localStorage.setItem("role", user.role);
          localStorage.setItem("userRole", user.role);

          // Set axios default header
          axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

          setMessage("Login Successful");
          handleCloseLogin();

          // Redirect based on role
          if (user.role === "ADMIN") {
            navigate("/admin/dashboard");
          } else if (user.role === "DRIVER") {
            navigate("/driver-dashboard");
          } else {
            navigate("/map");
          }
          return;
        } catch (authError) {
          throw new Error("Invalid email or password");
        }
      }

    } catch (error) {
      console.error("Login error:", error);
      setMessage(error.response?.data?.msg || error.response?.data?.message || error.message || "Invalid email or password");
    }
  };

  return (
    <Card 
      sx={{
        width: { xs: "90vw", sm: "85vw", md: "420px" },
        maxWidth: "420px",
        margin: "auto",
        borderRadius: { xs: "16px", sm: "20px", md: "24px" },
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        padding: { xs: "20px", sm: "24px", md: "28px" }
      }}
    >
      <CardContent sx={{ padding: { xs: "16px", sm: "20px" } }}>
        <Typography 
          variant="h5" 
          sx={{
            textAlign: "center",
            marginBottom: { xs: "16px", sm: "20px" },
            fontWeight: "600",
            color: "#3b3c54",
            fontSize: { xs: "1.25rem", sm: "1.5rem", md: "1.75rem" }
          }}
        >
          Login to Your Account
        </Typography>

        {message && (
          <Typography
            sx={{
              textAlign: "center",
              marginBottom: "16px",
              fontWeight: "500",
              fontSize: { xs: "0.875rem", sm: "1rem" },
              color: message.includes("Successful") ? "#4caf50" : "#f44336",
              padding: "8px 12px",
              backgroundColor: message.includes("Successful") ? "#e8f5e9" : "#ffebee",
              borderRadius: "8px"
            }}
          >
            {message}
          </Typography>
        )}

        <form 
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}
        >
          <TextField 
            label="Email" 
            name="email" 
            type="email" 
            value={form.email} 
            onChange={handleChange} 
            required 
            fullWidth
            variant="outlined"
            size="medium"
            sx={{
              "& .MuiOutlinedInput-root": {
                fontSize: { xs: "0.875rem", sm: "1rem" }
              },
              "& .MuiInputBase-input": {
                padding: { xs: "10px 12px", sm: "12px 14px" }
              }
            }}
          />

          <TextField 
            label="Password" 
            name="password" 
            type="password" 
            value={form.password} 
            onChange={handleChange} 
            required 
            fullWidth
            variant="outlined"
            size="medium"
            sx={{
              "& .MuiOutlinedInput-root": {
                fontSize: { xs: "0.875rem", sm: "1rem" }
              },
              "& .MuiInputBase-input": {
                padding: { xs: "10px 12px", sm: "12px 14px" }
              }
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{
              bgcolor: "#3b3c54",
              color: "white",
              fontWeight: "600",
              padding: { xs: "10px", sm: "12px", md: "14px" },
              fontSize: { xs: "0.875rem", sm: "1rem" },
              borderRadius: "8px",
              marginTop: { xs: "8px", sm: "12px" },
              ":hover": {
                bgcolor: "#2d2e42"
              },
              textTransform: "none"
            }}
          >
            Login
          </Button>
        </form>

        <Typography
          sx={{
            textAlign: "center",
            marginTop: { xs: "16px", sm: "20px" },
            fontSize: { xs: "0.75rem", sm: "0.875rem", md: "1rem" },
            color: "#666"
          }}
        >
          Don't have an account?{" "}
          <span
            onClick={switchToRegister}
            style={{
              color: "#e57373",
              fontWeight: "600",
              cursor: "pointer",
              textDecoration: "none",
              transition: "all 0.3s ease"
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
            onMouseLeave={(e) => e.target.style.textDecoration = "none"}
          >
            Sign Up
          </span>
        </Typography>
      </CardContent>
    </Card>
  );
}
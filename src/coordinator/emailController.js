const { supabase } = require("../supabase");

// Import Resend - try multiple methods to ensure compatibility
let resend = null;
let RESEND_API_KEY = process.env.RESEND_API_KEY;

const initializeResend = () => {
  try {
    // Method 1: Standard destructured import
    const { Resend } = require("resend");
    resend = new Resend(RESEND_API_KEY);
    console.log("✅ Resend initialized with destructured import");
    return true;
  } catch (error1) {
    console.log("❌ Destructured import failed:", error1.message);

    try {
      // Method 2: Default import
      const Resend = require("resend").default;
      resend = new Resend(RESEND_API_KEY);
      console.log("✅ Resend initialized with default import");
      return true;
    } catch (error2) {
      console.log("❌ Default import failed:", error2.message);

      try {
        // Method 3: Direct require
        const ResendClass = require("resend");
        resend = new ResendClass(RESEND_API_KEY);
        console.log("✅ Resend initialized with direct require");
        return true;
      } catch (error3) {
        console.error("❌ All Resend import methods failed:", error3.message);
        return false;
      }
    }
  }
};

// Initialize Resend on module load
const resendInitialized = initializeResend();

// Resend initialized successfully

// Test function to verify Resend is working
const testResendConnection = async () => {
  try {
    if (!resend || !resend.emails || typeof resend.emails.send !== "function") {
      throw new Error("Resend API is not properly initialized");
    }
    // Resend connection verified
    return true;
  } catch (error) {
    console.error("❌ Resend connection test failed:", error);
    return false;
  }
};

const sendTeacherAvailabilityNotification = async (req, res) => {
  try {
    // Test Resend connection first
    const isResendReady = await testResendConnection();
    if (!isResendReady) {
      return res.status(500).json({
        error: "Email service is not available",
        details: "Resend API is not properly initialized",
      });
    }

    const { teachers, coordinatorInfo, message } = req.body;

    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({
        error: "Teachers array is required and cannot be empty",
      });
    }

    // Get coordinator information if not provided
    let coordinator = coordinatorInfo;
    if (!coordinator) {
      // Check if we have user authentication context
      if (req.user?.id && supabase) {
        try {
          const { data: coordinatorData, error: coordinatorError } =
            await supabase
              .from("users")
              .select("name, email")
              .eq("id", req.user.id)
              .single();

          if (coordinatorError) {
            console.error("Error fetching coordinator info:", coordinatorError);
            coordinator = {
              name: "Academic Coordinator",
              email: "coordinator@icschedule.com",
            };
          } else {
            coordinator = coordinatorData;
          }
        } catch (error) {
          console.error("Error during coordinator lookup:", error);
          coordinator = {
            name: "Academic Coordinator",
            email: "coordinator@icschedule.com",
          };
        }
      } else {
        coordinator = {
          name: "Academic Coordinator",
          email: "coordinator@icschedule.com",
        };
      }
    }

    const emailPromises = teachers.map(async (teacher) => {
      const emailHtml = generateAvailabilityEmailTemplate({
        teacherName: teacher.name,
        coordinatorName: coordinator.name,
        coordinatorEmail: coordinator.email,
        customMessage: message,
        teacherInfo: teacher,
      });

      if (
        !resend ||
        !resend.emails ||
        typeof resend.emails.send !== "function"
      ) {
        throw new Error("Resend API is not properly initialized");
      }

      return resend.emails.send({
        from: "PhilSCA Academic System <hello@icschedule.com>",
        to: [teacher.email],
        subject: "Action Required: Please Set Your Teaching Availability",
        html: emailHtml,
      });
    });

    const results = await Promise.allSettled(emailPromises);

    // Count successful and failed emails
    const successful = results.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const failed = results.filter(
      (result) => result.status === "rejected"
    ).length;

    // Log failed emails for debugging
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Failed to send email to ${teachers[index].email}:`,
          result.reason
        );
      }
    });

    res.status(200).json({
      message: `Email notifications sent successfully`,
      summary: {
        total: teachers.length,
        successful,
        failed,
      },
      results: results.map((result, index) => ({
        teacher: teachers[index].name,
        email: teachers[index].email,
        status: result.status,
        error: result.status === "rejected" ? result.reason.message : null,
      })),
    });
  } catch (error) {
    console.error("Error sending email notifications:", error);
    res.status(500).json({
      error: "Failed to send email notifications",
      details: error.message,
    });
  }
};

const generateAvailabilityEmailTemplate = ({
  teacherName,
  coordinatorName,
  coordinatorEmail,
  customMessage,
  teacherInfo,
}) => {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          background-color: #f9fafb;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          padding: 32px 24px;
          text-align: center;
        }
        .header-icon {
          width: 48px;
          height: 48px;
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .header h1 {
          color: #ffffff;
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .header p {
          color: rgba(255, 255, 255, 0.9);
          font-size: 16px;
        }
        .content {
          padding: 32px 24px;
        }
        .alert-box {
          background-color: #fef3c7;
          border: 1px solid #fbbf24;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .alert-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .alert-icon {
          width: 20px;
          height: 20px;
          color: #d97706;
        }
        .alert-title {
          font-weight: 600;
          color: #92400e;
          font-size: 16px;
        }
        .alert-text {
          color: #b45309;
          font-size: 14px;
        }
        .teacher-info {
          background-color: #f3f4f6;
          border-radius: 8px;
          padding: 20px;
          margin: 24px 0;
        }
        .teacher-info h3 {
          color: #1f2937;
          font-size: 18px;
          margin-bottom: 12px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .info-value {
          font-size: 14px;
          color: #1f2937;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          background-color: #e5e7eb;
          color: #374151;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        .missing-badge {
          background-color: #fee2e2;
          color: #dc2626;
        }
        .action-section {
          background-color: #f8fafc;
          border-radius: 8px;
          padding: 24px;
          margin: 24px 0;
          text-align: center;
        }
        .action-button {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: #ffffff;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 16px;
          margin: 16px 0;
          transition: transform 0.2s;
        }
        .action-button:hover {
          transform: translateY(-1px);
        }
        .message-section {
          border-left: 4px solid #3b82f6;
          padding-left: 16px;
          margin: 24px 0;
        }
        .message-section h4 {
          color: #1f2937;
          font-size: 16px;
          margin-bottom: 8px;
        }
        .message-text {
          color: #4b5563;
          font-style: italic;
        }
        .footer {
          background-color: #f9fafb;
          padding: 24px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
        }
        .footer-text {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .contact-info {
          color: #3b82f6;
          font-size: 14px;
        }
        @media (max-width: 600px) {
          .info-grid {
            grid-template-columns: 1fr;
          }
          .container {
            margin: 0 16px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-icon">
            <svg class="alert-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </div>
          <h1>Action Required</h1>
          <p>Teaching Availability Settings</p>
        </div>

        <div class="content">
          <div class="alert-box">
            <div class="alert-header">
              <svg class="alert-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
              <span class="alert-title">Missing Availability Settings</span>
            </div>
            <p class="alert-text">
              Your teaching availability preferences are required for the upcoming scheduling process. 
              Please update your settings as soon as possible to ensure optimal class assignments.
            </p>
          </div>

          <p>Dear <strong>${teacherName}</strong>,</p>
          
          <p>We hope this message finds you well. As we prepare for the upcoming academic scheduling, 
          we've noticed that your teaching availability preferences have not been set in the PhilSCA system.</p>

          <div class="teacher-info">
            <h3>Your Current Information</h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Employee ID</span>
                <span class="info-value">${teacherInfo.employeeId}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Department</span>
                <span class="info-value">${teacherInfo.department}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Position</span>
                <span class="info-value">${teacherInfo.position}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Email</span>
                <span class="info-value">${teacherInfo.email}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Available Days</span>
                <span class="info-value">
                  ${
                    teacherInfo.availDays
                      ? `<span class="badge">${teacherInfo.availDays}</span>`
                      : `<span class="badge missing-badge">Not Set</span>`
                  }
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Preferred Time</span>
                <span class="info-value">
                  ${
                    teacherInfo.prefTime
                      ? `<span class="badge">${teacherInfo.prefTime}</span>`
                      : `<span class="badge missing-badge">Not Set</span>`
                  }
                </span>
              </div>
            </div>
          </div>

          ${
            customMessage
              ? `
            <div class="message-section">
              <h4>Message from ${coordinatorName}:</h4>
              <p class="message-text">"${customMessage}"</p>
            </div>
          `
              : ""
          }

          <div class="action-section">
            <h3 style="margin-bottom: 12px; color: #1f2937;">What You Need to Do</h3>
            <p style="margin-bottom: 16px; color: #4b5563;">
              Please log in to the PhilSCA system and update your availability preferences:
            </p>
            <ul style="text-align: left; margin: 16px 0; color: #4b5563;">
              <li style="margin-bottom: 8px;">Set your available teaching days</li>
              <li style="margin-bottom: 8px;">Specify your preferred time slots</li>
              <li style="margin-bottom: 8px;">Update any special scheduling requirements</li>
            </ul>
            <a href="https://icschedule.com/login" class="action-button">
              Update My Availability
            </a>
            <p style="font-size: 14px; color: #6b7280; margin-top: 12px;">
              <strong>Deadline:</strong> Please complete this within 48 hours
            </p>
          </div>

          <p>Setting your availability preferences helps us:</p>
          <ul style="margin: 16px 0; padding-left: 20px; color: #4b5563;">
            <li>Create schedules that work better for you</li>
            <li>Avoid scheduling conflicts</li>
            <li>Optimize classroom and resource allocation</li>
            <li>Ensure fair distribution of teaching loads</li>
          </ul>

          <p>If you have any questions or need assistance accessing the system, please don't hesitate to contact us.</p>
        </div>

        <div class="footer">
          <p class="footer-text">
            This email was sent on ${currentDate} by the Academic Coordination Office
          </p>
          <p class="contact-info">
            Contact: ${coordinatorName} - ${coordinatorEmail}
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">
            PhilSCA Academic Management System<br>
            This is an automated notification. Please do not reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Simple test endpoint to verify Resend is working
const testEmailService = async (req, res) => {
  try {
    console.log("🧪 Testing email service...");

    if (!resend || !resend.emails || typeof resend.emails.send !== "function") {
      return res.status(500).json({
        error: "Resend API is not properly initialized",
        resendExists: !!resend,
        emailsExists: !!resend?.emails,
        sendExists: typeof resend?.emails?.send,
      });
    }

    // Try to send a simple test email
    const testEmail = {
      from: "PhilSCA Academic System <hello@icschedule.com>",
      to: ["kilisob202@kwifa.com"], // change to test email
      subject: "Test Email - Resend Integration",
      html: "<h1>Test Email</h1><p>This is a test email to verify Resend integration.</p>",
    };

    console.log("📤 Attempting to send test email...");

    // Note: This might fail with invalid email, but it will tell us if the API is working
    const result = await resend.emails.send(testEmail);

    res.status(200).json({
      message: "Email service is working",
      testResult: result,
      resendStatus: {
        initialized: true,
        emailsExists: true,
        sendExists: true,
      },
    });
  } catch (error) {
    console.error("❌ Email service test failed:", error);
    res.status(500).json({
      error: "Email service test failed",
      details: error.message,
      resendStatus: {
        initialized: !!resend,
        emailsExists: !!resend?.emails,
        sendExists: typeof resend?.emails?.send,
      },
    });
  }
};

// Send schedule confirmation emails to teachers after auto-scheduling
const sendScheduleConfirmationEmails = async (teachers, schedule, loadMap) => {
  try {
    console.log("📧 Sending schedule confirmation emails...");

    if (!resend || !resend.emails || typeof resend.emails.send !== "function") {
      throw new Error("Resend API is not properly initialized");
    }

    const emailPromises = teachers.map(async (teacher) => {
      // Try different name fields - the teacher object might have different structure
      const teacherName =
        teacher.name || teacher.user_profile?.name || `Teacher ${teacher.id}`;
      const teacherSchedule = schedule[teacherName] || [];
      const newLoad = loadMap[teacherName] || 0;

      // Get teacher email from user profile
      const teacherEmail = teacher.user_profile?.email;
      if (!teacherEmail) {
        console.warn(`No email found for teacher: ${teacherName}`);
        return { status: "skipped", teacher: teacherName, reason: "No email" };
      }

      // Debug teacher data
      console.log(`Teacher object:`, {
        id: teacher.id,
        name: teacher.name,
        profileName: teacher.user_profile?.name,
        finalName: teacherName,
        email: teacherEmail,
      });

      const emailHtml = generateScheduleConfirmationTemplate({
        teacherName,
        teacherSchedule,
        newLoad,
        maxLoad: teacher.maxLoad || 0,
      });

      return resend.emails.send({
        from: "PhilSCA Academic System <hello@icschedule.com>",
        to: [teacherEmail],
        subject: "Schedule Update: Your New Teaching Assignment",
        html: emailHtml,
      });
    });

    const results = await Promise.allSettled(emailPromises);

    // Count successful and failed emails
    const successful = results.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const failed = results.filter(
      (result) => result.status === "rejected"
    ).length;

    console.log(`📊 Email results: ${successful} sent, ${failed} failed`);

    return { successful, failed, total: teachers.length };
  } catch (error) {
    console.error("Error sending schedule confirmation emails:", error);
    throw error;
  }
};

// Generate HTML template for schedule confirmation emails
const generateScheduleConfirmationTemplate = ({
  teacherName,
  teacherSchedule,
  newLoad,
  maxLoad,
}) => {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Group schedule by day
  const scheduleByDay = {};
  teacherSchedule.forEach((cls) => {
    if (!scheduleByDay[cls.day]) {
      scheduleByDay[cls.day] = [];
    }
    scheduleByDay[cls.day].push(cls);
  });

  // Sort days
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const sortedDays = dayOrder.filter((day) => scheduleByDay[day]);

  const scheduleHTML = sortedDays
    .map((day) => {
      const dayClasses = scheduleByDay[day].sort((a, b) =>
        a.start.localeCompare(b.start)
      );
      const classesHTML = dayClasses
        .map(
          (cls) => `
      <div style="background: #f8fafc; border-radius: 6px; padding: 12px; margin-bottom: 8px; border-left: 4px solid #3b82f6;">
        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${cls.subject} (${cls.subject_code})</div>
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 2px;">Section: ${cls.section} • Room: ${cls.room_title}</div>
        <div style="font-size: 14px; color: #6b7280;">Time: ${cls.start} - ${cls.end} • Units: ${cls.units}</div>
      </div>
    `
        )
        .join("");

      return `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">${day}</h3>
        ${classesHTML}
      </div>
    `;
    })
    .join("");

  const loadPercentage =
    maxLoad > 0 ? Math.round((newLoad / maxLoad) * 100) : 0;
  const loadColor =
    loadPercentage > 90
      ? "#dc2626"
      : loadPercentage > 75
      ? "#d97706"
      : "#059669";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background-color: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 24px; text-align: center; }
        .header-icon { width: 48px; height: 48px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: white; }
        .header h1 { color: #ffffff; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .header p { color: rgba(255, 255, 255, 0.9); font-size: 16px; }
        .content { padding: 32px 24px; }
        .alert-box { background-color: #dcfce7; border: 1px solid #16a34a; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
        .alert-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .alert-title { font-weight: 600; color: #15803d; font-size: 16px; }
        .alert-text { color: #166534; font-size: 14px; }
        .load-info { background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0; }
        .load-bar { width: 100%; height: 20px; background-color: #e5e7eb; border-radius: 10px; overflow: hidden; margin-top: 8px; }
        .load-fill { height: 100%; background-color: ${loadColor}; transition: width 0.3s ease; }
        .footer { background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb; text-align: center; }
        .footer-text { color: #6b7280; font-size: 14px; margin-bottom: 8px; }
        @media (max-width: 600px) { .container { margin: 0 16px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-icon">
            ✓
          </div>
          <h1>Schedule Updated</h1>
          <p>Your Teaching Assignment</p>
        </div>

        <div class="content">
          <div class="alert-box">
            <div class="alert-header">
              <span style="color: #15803d; font-size: 18px; font-weight: bold;">✓</span>
              <span class="alert-title">Schedule Successfully Generated</span>
            </div>
            <p class="alert-text">
              Your teaching schedule has been automatically updated. Please review your new assignments below.
            </p>
          </div>

          <p>Dear <strong>${teacherName}</strong>,</p>
          
          <p>Your teaching schedule has been successfully generated through our automated scheduling system. Below are your new class assignments and updated teaching load.</p>

          <div class="load-info">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px;">Teaching Load Summary</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 14px; color: #6b7280;">Current Load:</span>
              <span style="font-weight: 600; color: #1f2937;">${newLoad} / ${maxLoad} units</span>
            </div>
            <div class="load-bar">
              <div class="load-fill" style="width: ${loadPercentage}%;"></div>
            </div>
            <div style="text-align: center; margin-top: 8px; font-size: 14px; color: ${loadColor}; font-weight: 600;">
              ${loadPercentage}% of maximum load
            </div>
          </div>

          <h3 style="color: #1f2937; font-size: 20px; margin-bottom: 16px;">Your Weekly Schedule</h3>
          
          ${
            teacherSchedule.length > 0
              ? scheduleHTML
              : '<p style="color: #6b7280; font-style: italic;">No classes assigned at this time.</p>'
          }

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <h4 style="color: #1f2937; font-size: 16px; margin-bottom: 12px;">What's Next?</h4>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
              <li style="margin-bottom: 8px;">Review your schedule for any conflicts</li>
              <li style="margin-bottom: 8px;">Log in to the system to access detailed class information</li>
              <li style="margin-bottom: 8px;">Contact the Academic Coordinator if you have concerns</li>
              <li>Prepare your course materials for the upcoming classes</li>
            </ul>
          </div>

          <p>If you have any questions about your new schedule or need to report any conflicts, please contact the Academic Coordination Office immediately.</p>
        </div>

        <div class="footer">
          <p class="footer-text">
            This email was sent on ${currentDate} by the Academic Coordination Office
          </p>
          <p style="color: #3b82f6; font-size: 14px;">
            PhilSCA Academic Management System
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">
            If you have questions about your schedule, please contact the Academic Coordination Office.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send welcome email with password to new users
const sendWelcomeEmailWithPassword = async (
  userEmail,
  userName,
  password,
  userRole,
  confirmationUrl = null
) => {
  try {
    if (!resend || !resend.emails || typeof resend.emails.send !== "function") {
      throw new Error("Resend API is not properly initialized");
    }

    const emailHtml = generateWelcomeEmailTemplate({
      userName,
      userEmail,
      password,
      userRole,
      confirmationUrl,
    });

    const result = await resend.emails.send({
      from: "PhilSCA Academic System <hello@icschedule.com>",
      to: [userEmail],
      subject: "Welcome to PhilSCA Academic System - Account Created",
      html: emailHtml,
    });

    console.log(`✅ Welcome email sent to ${userEmail}`);
    return result;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};

// Generate HTML template for welcome emails
const generateWelcomeEmailTemplate = ({
  userName,
  userEmail,
  password,
  userRole,
  confirmationUrl,
}) => {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background-color: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center; }
        .header-icon { width: 48px; height: 48px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: white; }
        .header h1 { color: #ffffff; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .header p { color: rgba(255, 255, 255, 0.9); font-size: 16px; }
        .content { padding: 32px 24px; }
        .welcome-box { background-color: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
        .welcome-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .welcome-title { font-weight: 600; color: #1d4ed8; font-size: 16px; }
        .welcome-text { color: #1e40af; font-size: 14px; }
        .credentials-box { background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #059669; }
        .credential-item { margin-bottom: 12px; }
        .credential-label { font-size: 12px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .credential-value { font-size: 16px; font-weight: 600; color: #1f2937; background-color: #e5e7eb; padding: 8px 12px; border-radius: 4px; font-family: 'Courier New', monospace; }
        .action-section { background-color: #f8fafc; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center; }
        .action-button { display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 16px 8px; }
        .action-button.secondary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); }
        .warning-box { background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 24px 0; }
        .warning-text { color: #92400e; font-size: 14px; }
        .footer { background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb; text-align: center; }
        .footer-text { color: #6b7280; font-size: 14px; margin-bottom: 8px; }
        @media (max-width: 600px) { .container { margin: 0 16px; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-icon">
            👋
          </div>
          <h1>Welcome to PhilSCA</h1>
          <p>Your Academic System Account</p>
        </div>

        <div class="content">
          <div class="welcome-box">
            <div class="welcome-header">
              <span style="color: #1d4ed8; font-size: 18px; font-weight: bold;">✓</span>
              <span class="welcome-title">Account Successfully Created</span>
            </div>
            <p class="welcome-text">
              Your ${userRole} account has been created in the PhilSCA Academic Management System.
            </p>
          </div>

          <p>Dear <strong>${userName}</strong>,</p>
          
          <p>Welcome to the Philippine State College of Aeronautics (PhilSCA) Academic Management System! Your account has been successfully created with the following credentials:</p>

          <div class="credentials-box">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 16px;">Your Login Credentials</h3>
            <div class="credential-item">
              <div class="credential-label">Email / Username</div>
              <div class="credential-value">${userEmail}</div>
            </div>
            <div class="credential-item">
              <div class="credential-label">Temporary Password</div>
              <div class="credential-value">${password}</div>
            </div>
            <div class="credential-item">
              <div class="credential-label">Role</div>
              <div class="credential-value">${userRole}</div>
            </div>
          </div>

          ${
            confirmationUrl === "VERIFICATION_REQUIRED"
              ? `
            <div class="action-section">
              <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px;">Important: Verify Your Email First</h3>
              <p style="margin-bottom: 16px; color: #4b5563;">
                You will receive a separate email from Supabase with a verification link. 
                <strong>You must click that link before you can log in to the system.</strong>
              </p>
              <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin: 16px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                  <strong>Check your inbox:</strong> Look for an email with subject "Confirm your signup" and click the verification link.
                </p>
              </div>
            </div>
          `
              : confirmationUrl
              ? `
            <div class="action-section">
              <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px;">Important: Confirm Your Email</h3>
              <p style="margin-bottom: 16px; color: #4b5563;">
                Before you can log in, you must verify your email address by clicking the button below:
              </p>
              <a href="${confirmationUrl}" class="action-button">
                Confirm Email Address
              </a>
              <p style="font-size: 14px; color: #6b7280; margin-top: 12px;">
                This link will expire in 24 hours
              </p>
            </div>
          `
              : ""
          }

          <div class="action-section">
            <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 12px;">Next Steps</h3>
            <ol style="text-align: left; margin: 16px 0; color: #4b5563; padding-left: 20px;">
              ${
                confirmationUrl
                  ? '<li style="margin-bottom: 8px;"><strong>First:</strong> Check your inbox and verify your email address</li>'
                  : ""
              }
              <li style="margin-bottom: 8px;">${
                confirmationUrl ? "After email verification, log" : "Log"
              } in to the system using your credentials</li>
              <li style="margin-bottom: 8px;">Change your password on first login</li>
              <li style="margin-bottom: 8px;">Complete your profile information</li>
              ${
                userRole === "Faculty"
                  ? "<li>Set your teaching availability preferences</li>"
                  : "<li>Explore the system features</li>"
              }
            </ol>
            ${
              confirmationUrl
                ? ""
                : `
              <a href="https://icschedule.com/login" class="action-button secondary">
                Login to System
              </a>
            `
            }
          </div>

          <div class="warning-box">
            <p class="warning-text">
              <strong>Security Notice:</strong> This is a temporary password. Please change it immediately after your first login. 
              Do not share your credentials with anyone.
            </p>
          </div>

          <p>If you have any questions or need assistance, please contact the Academic Coordination Office.</p>
        </div>

        <div class="footer">
          <p class="footer-text">
            This email was sent on ${currentDate} by the Academic Coordination Office
          </p>
          <p style="color: #3b82f6; font-size: 14px;">
            PhilSCA Academic Management System
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">
            If you have questions about your account, please contact the Academic Coordination Office.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  sendTeacherAvailabilityNotification,
  testEmailService,
  sendScheduleConfirmationEmails,
  sendWelcomeEmailWithPassword,
};

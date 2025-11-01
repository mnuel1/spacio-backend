const supabase = require("../supabase");
const { getUsersQuery } = require("../queries/coordinator");
const { sendWelcomeEmailWithPassword } = require("./emailController");

const fs = require("fs");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const getUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select(getUsersQuery);

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Users retrieved successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error retrieving users:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("user_profile")
      .update({ status: false }) // Changed from "Inactive" to false
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "User deactivated successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error deactivating user:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const reactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("user_profile")
      .update({ status: true })
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "User reactivated successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error reactivating user:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("user_profile")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "User deleted successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error deleting user:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

function parseFile(filepath, mimetype) {
  if (mimetype === "text/csv" || filepath.endsWith(".csv")) {
    const file = fs.readFileSync(filepath, "utf8");
    const { data } = Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
    });
    return data;
  }

  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel" ||
    filepath.endsWith(".xlsx") ||
    filepath.endsWith(".xls")
  ) {
    const workbook = XLSX.readFile(filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  throw new Error("Unsupported file format");
}

const addUsersByFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        title: "Failed",
        message: "No file uploaded.",
        data: null,
      });
    }

    let users;
    try {
      users = parseFile(req.file.path, req.file.mimetype);
    } catch (err) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: err.message });
    }

    const results = [];

    for (const user of users) {
      const { email, name, role } = user;

      const pass = name.replace(/\s+/g, "").toUpperCase();

      const { data: authData, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            name,
            role,
          },
        },
      });

      if (error) {
        results.push({ email, success: false, error: error.message });
      } else {
        results.push({ email, success: true });

        // Send welcome email with password
        // Note: Since we're using signUp(), user will receive Supabase confirmation email
        // We include a note about email verification in our welcome email
        try {
          await sendWelcomeEmailWithPassword(
            email,
            name,
            pass,
            role,
            "VERIFICATION_REQUIRED"
          );
        } catch (emailError) {
          console.error(
            `❌ Failed to send welcome email to ${email}:`,
            emailError.message
          );
          // Don't fail the user creation if email fails
        }
      }

      await new Promise((res) => setTimeout(res, 300));
    }

    fs.unlinkSync(req.file.path);

    return res.status(200).json({
      title: "Success",
      message: "Users added successfully.",
      data: results,
    });
  } catch (error) {
    console.error("Error adding users by CSV or Excel:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getUsers,
  deactivateUser,
  reactivateUser,
  deleteUser,
  addUsersByFile,
};

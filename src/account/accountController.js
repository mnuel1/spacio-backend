const supabase = require("../../supabase");
require('dotenv').config();
const APP_URL = process.env.APP_URL
const editInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstname,
      lastname,
      email,
      phone,
      birthdate,
      gender,
      civil_status,
      address,
      em_contact_name,
      em_contact_phone,
      em_contact_rs,
      department_id,
      position_id
    } = req.body;

    const fullName = `${firstname} ${lastname}`.trim();

    const { error: userError } = await supabase
      .from('user_profiles')
      .update({
        name: fullName,
        email,
        phone,
        birthdate,
        gender,
        civil_status,
        address
      })
      .eq('id', id);

    if (userError) throw userError;

    const { error: teacherError } = await supabase
      .from('teacher_profile')
      .update({
        em_contact_name,
        em_contact_phone,
        em_contact_rs,
        department_id,
        position_id
      })
      .eq('user_id', id);

    if (teacherError) throw teacherError;

    return res.status(200).json({
      title: 'Success',
      message: 'User information updated successfully.',
      data: null
    });
  } catch (error) {
    console.error('Error updating user info:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};


const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const { data, error } = await supabase.auth.admin.updateUserById(id, {
      password,
    });

    if (error) {
      return res.status(400).json({
        title: "Error",
        message: error.message,
        data: null,
      });
    }

    return res.status(200).json({
      title: "Success",
      message: "Password changed successfully.",
      data,
    });
  } catch (error) {
    console.error("Error changing password:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/reset-password`,
    });

    if (error) {
      return res.status(400).json({
        title: "Error",
        message: error.message,
        data: null,
      });
    }

    return res.status(200).json({
      title: "Success",
      message: "Password reset email sent.",
      data,
    });
  } catch (error) {
    console.error("Error sending password reset:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};


module.exports = {
  editInfo,
  changePassword,
  forgotPassword
};
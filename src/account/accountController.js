const supabase = require("../../supabase");
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


// PENDING!
const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({ password })
      .eq('id', id);
    if (error) throw error;
    if (data.length === 0) {
      return res.status(404).json({
        title: 'Not Found',
        message: 'User not found.',
        data: null
      });
    }
    return res.status(200).json({
      title: 'Success',
      message: 'Password changed successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error changing password:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

module.exports = {
  editInfo,
  changePassword
};
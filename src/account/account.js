const supabase = require("../../supabase");

const editInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({ name, email, role })
      .eq('id', id)
      .select();

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
      message: 'User information updated successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error updating user info:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

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
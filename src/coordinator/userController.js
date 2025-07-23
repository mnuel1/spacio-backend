const supabase = require("../../supabase");
const getUsersQuery = require("../queries/coordinator").getUsersQuery;

const getUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_profile')
      .select(getUsersQuery);

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Users retrieved successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error retrieving users:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('user_profile')
      .update({ status: 'Inactive' })
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'User deactivated successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error deactivating user:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users_profile')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'User deleted successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error deleting user:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

// PENDING!
const addUsersByFile = async (req, res) => {
  try {
    const { file } = req;

    if (!file) {
      return res.status(400).json({
        title: 'Failed',
        message: 'No file uploaded.',
        data: null
      });
    }

    // Process the file and add users logic here
    // This is a placeholder for actual implementation

    return res.status(200).json({
      title: 'Success',
      message: 'Users added successfully.',
      data: null
    });
  } catch (error) {
    console.error('Error adding users by CSV or Excel:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

module.exports = {
  getUsers,
  deactivateUser,
  deleteUser,
  addUsersByFile
};
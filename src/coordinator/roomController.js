const supabase = require('../../supabase');

const getRooms = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('room')
      .select(`
        *, 
        
        departments(name)
`)
      // .neq('status', "Inactive");

    if (error) throw error; 

    return res.status(200).json({
      title: 'Success',
      message: 'Rooms fetched successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error fetching rooms:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};

module.exports = { getRooms };

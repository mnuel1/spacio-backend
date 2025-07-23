const supabase = require('../../supabase');

const getDataMaster = async (req, res) => {
  try {
    const { data: subjects, error: subjectError } = await supabase
      .from('subjects')
      .select('id, subject, subject_code');
    if (subjectError) throw subjectError;

    const { data: rooms, error: roomError } = await supabase
      .from('room')
      .select('id, name');
    if (roomError) throw roomError;

    const { data: faculties, error: facultyError } = await supabase
      .from('teacher_profile')
      .select('id, user_profile:teacher_profile_user_id_fkey(name)')
      .eq('role', 'Faculty');
    if (facultyError) throw facultyError;

    const { data: sections, error: sectionError } = await supabase
      .from('section')
      .select('id, name');
    if (sectionError) throw sectionError;

    return res.status(200).json({
      title: 'Success',
      message: 'Data master retrieved successfully.',
      data: {
        subjects,
        rooms,
        faculties,
        sections
      }
    });
  } catch (error) {
    console.error('Error retrieving data master:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};

module.exports = {
  getDataMaster
};
const supabase = require('../../supabase');
const getSchedulesQuery = require('../queries/coordinator').getSchedulesQuery;

const dayAbbreviations = {
  Monday: 'M',
  Tuesday: 'T',
  Wednesday: 'W',
  Thursday: 'TH',
  Friday: 'F',
  Saturday: 'S',
  Sunday: 'SU'
};

const abbreviateDays = (days) => {
  if (!Array.isArray(days)) return [];
  return days.map(day => dayAbbreviations[day] || day);
};

const getSchedule = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select(getSchedulesQuery);

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Schedules retrieved successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error retrieving schedules:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const createSChedule = async (req, res) => {
  try {
    const {
      subject_id,
      teacher_id,
      section_id,
      room_id,
      days,
      start_time,
      end_time,
      total_copunt,
      semester,
      school_year } = req.body;

    days = abbreviateDays(days);
    const { data, error } = await supabase
      .from('teacher_schedules')
      .insert({
        subject_id,
        teacher_id,
        section_id,
        room_id,
        days,
        start_time,
        end_time,
        total_copunt,
        semester,
        school_year
      })
      .select();

    if (error) throw error;

    return res.status(201).json({
      title: 'Success',
      message: 'Schedule created successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error creating schedule:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subject_id,
      teacher_id,
      section_id,
      room_id,
      days,
      start_time,
      end_time,
      total_copunt,
      semester,
      school_year } = req.body;
    days = abbreviateDays(days);
    const { data, error } = await supabase
      .from('teacher_schedules')
      .update({
        subject_id,
        teacher_id,
        section_id,
        room_id,
        days,
        start_time,
        end_time,
        total_copunt,
        semester,
        school_year
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (data.length === 0) {
      return res.status(404).json({
        title: 'Not Found',
        message: 'Schedule not found.',
        data: null
      });
    }

    return res.status(200).json({
      title: 'Success',
      message: 'Schedule updated successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error updating schedule:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('teacher_schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (data.length === 0) {
      return res.status(404).json({
        title: 'Not Found',
        message: 'Schedule not found.',
        data: null
      });
    }

    return res.status(200).json({
      title: 'Success',
      message: 'Schedule deleted successfully.',
      data: null
    });
  } catch (error) {
    console.error('Error deleting schedule:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};

module.exports = {
  getSchedule,
  createSChedule,
  updateSchedule,
  deleteSchedule
};
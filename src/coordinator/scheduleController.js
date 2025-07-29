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

const transformSchedule = (schedule) => {

  // Format duration in minutes
  const getDuration = (start, end) => {
    const startTime = new Date(`1970-01-01T${start}Z`);
    const endTime = new Date(`1970-01-01T${end}Z`);
    return (endTime - startTime) / 60000; // in minutes
  };

  return {
    id: schedule.id, // e.g., SCH001
    subjectId: schedule?.subjects?.id || "None",
    facultyId: schedule.teacher_profile.id,
    roomId: schedule.room.id,
    timeSlot: {
      id: schedule.id,
      day: schedule.days || '',
      startTime: schedule.start_time ? schedule.start_time.slice(0, 5) : '',
      endTime: schedule.end_time ? schedule.end_time.slice(0, 5) : '',
      duration: getDuration(schedule.start_time, schedule.end_time)
    },
    section: schedule.section?.name || '',
    enrollmentCount: schedule.total_count || 0,
    academicYear: schedule.school_year || '',
    semester: schedule.semester || '',
    status: 'Scheduled', // static since you didn't provide dynamic status
    createdAt: schedule.created_at ? new Date(schedule.created_at) : null,
    updatedAt: schedule.updated_at ? new Date(schedule.updated_at) : null,
    createdBy: schedule.user_profile?.name || '',
    extra: {
      teacher_profile: schedule.teacher_profile,
      subjects: schedule.subjects,
      room: schedule.room,
      user_profile: schedule.user_profile
    }
  };
};

const getSchedule = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select(getSchedulesQuery);



    if (error) throw error;

    const transformSchedules = (data = []) => data.map(transformSchedule);

    return res.status(200).json({
      title: 'Success',
      message: 'Schedules retrieved successfully.',
      data: transformSchedules(data) // ✅ pass the data here
    });
  } catch (error) {
    console.error('Error retrieving schedules:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};

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
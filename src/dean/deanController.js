const supabase = require("../supabase");

const recordLog = async (body) => {
  try {
    const { activity, by } = body;

    if (!activity || !by) {
      return res.status(400).json({
        title: "Failed",
        message: "Missing required fields: activity or by",
        data: null,
      });
    }

    const { data, error } = await supabase
      .from("activity_logs")
      .insert([{ activity, by }])
      .select(
        `
        id,
        activity,
        created_at,
        user_profile:by (
          id,
          name,
          email,
          role
        )
      `
      )
      .single();

    if (error) throw error;

    return res.status(201).json({
      title: "Success",
      message: "Activity log created",
      data,
    });
  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getLogs = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("activity_logs")
      .select(
        `
        id,
        activity,
        created_at,
        user_profile:by (
          id,
          name,
          email,
          role
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Activity logs fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getSchedule = async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("teacher_schedules")
      .select(
        `
        id,
        teacher_id,
        subject_id,
        section_id,
        room_id,
        start_time,
        end_time,
        days,
        semester,
        school_year,
        total_count,
        total_duration,
        teacher_profile ( id, 
          user_profile:teacher_profile_user_id_fkey (
            id, user_id, name, email, profile_image, status
          ) 
        ),
        subjects:teacher_schedules_subject_id_fkey ( id, subject_code, subject ),
        sections:teacher_schedules_section_id_fkey ( id, name ),
        rooms:teacher_schedules_room_id_fkey ( room_id, room_title )
      `
      );

    if (error) throw error;

    // 2. Rebuild into your expected `schedule` shape
    const schedule = {};

    rows.forEach((row) => {
      const teacherName = row.teacher_profile?.user_profile?.name || "Unknown";
      if (!schedule[teacherName]) schedule[teacherName] = [];

      const dayMap = {
        M: "Monday",
        T: "Tuesday",
        W: "Wednesday",
        Th: "Thursday",
        F: "Friday",
      };

      // Expand compact day string ("MWF") back to array
      const daysExpanded =
        row.days.match(/Th|[MTWF]/g)?.map((d) => dayMap[d]) || [];

      daysExpanded.forEach((day) => {
        schedule[teacherName].push({
          subject: row.subjects?.subject,
          subject_code: row.subjects?.subject_code,
          section_id: row.sections?.id,
          section: row.sections?.name,
          day,
          start: row.start_time,
          end: row.end_time,
          room_title: row.rooms?.room_title,
          room_id: row.rooms?.room_id,
          units: row.total_duration, // or derive from subjects table if needed
        });
      });
    });

    return res.status(200).json({
      title: "Success",
      message: "Schedules fetched",
      data: schedule,
    });
  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  recordLog,
  getLogs,
  getSchedule,
};

const supabase = require("../../supabase");
const {
  generateDayAbbrev,
  parseAvailableDays,
  generateTimeSlots
} = require("../utils")
const {
  getMyLoadQuery,
  getMySchedulesQuery
} = require("../queries/faculty");

const getDashboard = async (req, res) => {
  try {
    
  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const getMySchedules = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .select(getMySchedulesQuery)
      .eq("teacher_id", id);

    if (error) {
      throw error;
    }

    const events = data.map((item, index) => {
      const [hour, minute, second] = item.start_time.split(":").map(Number);
      const [endHour, endMinute] = item.end_time.split(":").map(Number);

      const start = new Date();
      const end = new Date();

      start.setHours(hour, minute, second || 0, 0);
      end.setHours(endHour, endMinute, 0, 0);

      return {
        id: `event-${index + 1}`,
        title: item.subjects.subject_code,
        subject: item.subjects.subject,
        subjectCode: item.subjects.subject_code,
        room: item.rooms?.room_title || "TBA",
        section: item.sections?.name || "Unknown",
        students: item.total_count || 0,
        start,
        end,
        type: "lecture",      // hardcoded or derive from subject if available
        status: "Scheduled",
        description: "",      // optional: if subject.description available
        objectives: [],       // optional: fill if available
        materials: []         // optional: fill if available
      };
    });


    return res.status(200).json({
      title: 'Success',
      message: 'Schedules get successfully.',
      data: events
    });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const getMyLoad = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .select(getMyLoadQuery)
      .eq("teacher_id", id);

    if (error) throw error;

    // Group by subject + section
    const grouped = {};

    data.forEach(entry => {
      const subjKey = `${entry.subjects.id}-${entry.sections.id}`;

      if (!grouped[subjKey]) {
        grouped[subjKey] = {
          id: entry.subjects.id,
          code: entry.subjects.subject_code,
          name: entry.subjects.subject,
          department: entry.teacher_profile?.departments?.name || null,
          credits: entry.subjects.units,
          type: "lecture",
          semester: entry.semester === "1st" ? "First Semester" : "Second Semester",
          academicYear: entry.school_year,
          sections: [],
        };
      }

      let section = grouped[subjKey].sections.find(s => s.id === entry.sections.id);
      if (!section) {
        section = {
          id: entry.sections.id,
          section: entry.sections.name,
          schedule: [],
          enrolledStudents: entry.total_count,
          maxCapacity: 45,
          hoursPerWeek: entry.subjects.units,
        };
        grouped[subjKey].sections.push(section);
      }

      // Expand days like "MWF" => ["Monday", "Wednesday", "Friday"]
      const dayMap = { M: "Monday", T: "Tuesday", W: "Wednesday", Th: "Thursday", F: "Friday" };
      const dayCodes = entry.days.match(/Th|[MTWF]/g); // handles "Th" as one

      for (const d of dayCodes) {
        section.schedule.push({
          day: dayMap[d],
          startTime: entry.start_time.slice(0, 5), // "13:00:00" -> "13:00"
          endTime: entry.end_time.slice(0, 5),
          room: entry.rooms.room_id,
        });
      }
    });

    return res.status(200).json({
      title: 'Success',
      message: 'Schedules get successfully.',
      data: Object.values(grouped),
    });

  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const getPrefTimeDay = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_profile")
      .select('avail_days, pref_time')
      .eq("id", id)
      .single();

    if (error || !data) throw error;

    const { avail_days, pref_time } = data;

    const availableDays = parseAvailableDays(avail_days); // from your utils

    // Parse time range string (e.g. "09:00-17:00") to time slot array
    const [start, end] = pref_time.split("-");
    const timeSlots = generateTimeSlots(); // e.g. returns ["08:00", ..., "17:00"]

    // Get only the relevant hours in the range
    const filteredSlots = timeSlots.filter(slot => slot >= start && slot <= end);

    // Build the availability object
    const availability = {};
    timeSlots.forEach(slot => {
      availableDays.forEach(day => {
        const key = day.toLowerCase(); // convert "Monday" → "monday"
        if (!availability[key]) availability[key] = {};
        availability[key][slot] = filteredSlots.includes(slot);
      });
    });

    return res.status(200).json({
      title: 'Success',
      message: 'Schedules fetched successfully.',
      data: availability,
    });

  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const savePrefTImeDay = async (req, res) => {

  try {
    const { id, workDays, workHours } = req.body

    const abbreviatedDays = generateDayAbbrev(workDays);
    const timeRange = `${workHours[0]}-${workHours[workHours.length - 1]}`;

    const { data, error } = await supabase
      .from("teacher_schedules")
      .update({
        avail_days: abbreviatedDays,
        pref_time: timeRange,
      })
      .eq("teacher_id", id);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      title: "Success",
      message: "Preferences saved successfully",
      data,
    });


  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

module.exports = {
  getMySchedules,
  getMyLoad,
  getPrefTimeDay,
  savePrefTImeDay
};



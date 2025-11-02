const supabase = require("../supabase");
const {
  generateDayAbbrev,
  parseAvailableDays,
  generateTimeSlots,
} = require("../utils");
const { getMyLoadQuery, getMySchedulesQuery } = require("../queries/faculty");

const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat.js");
const relativeTime = require("dayjs/plugin/relativeTime");

dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);

const scheduleOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_schedules")
    .select(getMySchedulesQuery)
    .eq("teacher_id", id);

  if (error) {
    throw error;
  }

  const now = dayjs(); // Server time
  const currentDay = now.format("dddd"); // e.g., "Monday"
  const currentTime = now.format("HH:mm");

  const classes = [];
  const allClasses = [];
  let totalClassesToday = 0;
  let completedToday = 0;
  let upcomingToday = [];

  data.map((item) => {
    // Skip items with missing required data
    if (
      !item.subjects ||
      !item.sections ||
      !item.rooms ||
      !item.days ||
      !item.start_time ||
      !item.end_time
    ) {
      console.warn(`⚠️ Skipping incomplete schedule item ID ${item.id}`);
      return;
    }

    const fullDays = parseAvailableDays(item.days);
    const isToday = fullDays.includes(currentDay);

    const todayDate = now.format("YYYY-MM-DD");
    const start = dayjs(
      `${todayDate} ${item.start_time}`,
      "YYYY-MM-DD HH:mm:ss"
    );
    const end = dayjs(`${todayDate} ${item.end_time}`, "YYYY-MM-DD HH:mm:ss");

    let status = "upcoming";

    if (isToday) {
      totalClassesToday++;

      if (now.isBefore(start)) {
        status = "upcoming";
        upcomingToday.push(start);
      } else if (now.isAfter(end)) {
        status = "completed";
        completedToday++;
      } else {
        status = "current";
      }
      classes.push({
        id: item.id,
        subject: item.subjects?.subject || "Unknown Subject",
        code: item.subjects?.subject_code || "N/A",
        section: item.sections?.name || "Unknown",
        time: `${start.format("HH:mm")} - ${end.format("HH:mm")}`,
        room: item.rooms?.room_title || "TBA",
        students: item.total_count || 0,
        status,
      });
    }

    let scheduledDateTime = null;

    for (let i = 0; i < 7; i++) {
      const checkDate = now.add(i, "day");
      if (fullDays.includes(checkDate.format("dddd"))) {
        scheduledDateTime = dayjs(
          `${checkDate.format("YYYY-MM-DD")} ${item.start_time}`,
          "YYYY-MM-DD HH:mm:ss"
        );
        break;
      }
    }

    // 🛡️ Ensure scheduledDateTime is a valid Dayjs object
    if (scheduledDateTime && scheduledDateTime.isValid()) {
      const timeUntil = scheduledDateTime.fromNow();
      const readableDate = scheduledDateTime.format("dddd, MMMM D, YYYY");

      allClasses.push({
        id: item.id,
        subject: item.subjects?.subject || "Unknown Subject",
        code: item.subjects?.subject_code || "N/A",
        section: item.sections?.name || "Unknown",
        time: `${start.format("HH:mm")} - ${end.format("HH:mm")}`,
        room: item.rooms?.room_title || "TBA",
        students: item.total_count || 0,
        date: readableDate,
        timeUntil: timeUntil,
        status: timeUntil,
      });
    } else {
      console.warn(`Invalid scheduledDateTime for item ID ${item.id}`);
    }
  });

  const nextClassTime = upcomingToday.length
    ? [...upcomingToday]
        .sort((a, b) => a.valueOf() - b.valueOf())[0]
        .format("hh:mm A")
    : null;

  return {
    currentTime: now.format("hh:mm A"),
    date: now.format("dddd, MMMM D, YYYY"),
    todaysClasses: {
      metric: totalClassesToday,
      completedClass: completedToday,
      nextClass: nextClassTime,
    },
    classes,
    allClasses,
  };
};

const availabilityOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_profile")
    .select("avail_days, pref_time")
    .eq("id", id)
    .maybeSingle();

  // If no teacher profile exists, return default empty availability
  if (error || !data) {
    console.warn(
      `⚠️ No teacher profile found for ID ${id}, returning default availability`
    );
    const allDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    return allDays.map((day) => ({
      day,
      available: false,
      preferredTimes: [],
      restrictedTimes: [],
    }));
  }

  const { avail_days, pref_time } = data;
  const availableDays = parseAvailableDays(avail_days); // e.g., ["Monday", "Wednesday", "Friday"]

  const allDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const dailyPreferences = allDays.map((day) => ({
    day,
    available: availableDays.includes(day),
    preferredTimes: availableDays.includes(day) && pref_time ? [pref_time] : [],
    restrictedTimes: [],
  }));

  return dailyPreferences;
};

const loadOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_schedules")
    .select(getMyLoadQuery)
    .eq("teacher_id", id);

  if (error) throw error;

  const subjectMap = {};
  let totalSubjects = 0;
  let totalSections = 0;
  let totalStudents = 0;
  let weeklyHours = 0;

  data.forEach((entry) => {
    // Skip entries with missing required data
    if (
      !entry.subjects ||
      !entry.sections ||
      !entry.rooms ||
      !entry.days ||
      !entry.start_time ||
      !entry.end_time
    ) {
      console.warn(`⚠️ Skipping incomplete load entry`);
      return;
    }

    const subjectId = entry.subjects.id;

    // Initialize subject entry
    if (!subjectMap[subjectId]) {
      subjectMap[subjectId] = {
        id: subjectId,
        code: entry.subjects.subject_code || "N/A",
        title: entry.subjects.subject || "Unknown Subject",
        sections: [],
        totalStudents: 0,
        weeklyHours: 0,
        level: entry.subjects.level || "undergraduate",
      };
      totalSubjects++;
    }

    const subject = subjectMap[subjectId];

    // Process schedule string (e.g. "MWF 08:00-09:30")
    const dayMap = { M: "M", T: "T", W: "W", Th: "Th", F: "F" };
    const rawDays = entry.days.match(/Th|[MTWF]/g) || [];
    const shortDays = rawDays.map((d) => dayMap[d]).join("");

    const timeRange = `${entry.start_time.slice(0, 5)}-${entry.end_time.slice(
      0,
      5
    )}`;
    const scheduleStr = `${shortDays} ${timeRange}`;

    // Check if section already added under this subject
    const existingSection = subject.sections.find(
      (s) => s.id === entry.sections.id
    );

    if (existingSection) {
      existingSection.schedule += `, ${scheduleStr}`; // merge schedules
    } else {
      subject.sections.push({
        id: entry.sections.name || "Unknown",
        students: entry.total_count || 0,
        schedule: scheduleStr,
        room: entry.rooms.room_title || "TBA",
      });
      subject.totalStudents += entry.total_count || 0;
      subject.weeklyHours += entry.subjects.units || 0;

      totalStudents += entry.total_count || 0;
      weeklyHours += entry.subjects.units || 0;
      totalSections++;
    }
  });

  // Build final structured response
  const subjects = Object.values(subjectMap);

  return {
    summary: {
      totalSubjects,
      totalSections,
      totalStudents,
      weeklyHours,
      maxCapacity: 21,
      loadPercentage: Math.round((weeklyHours / 21) * 100), // assuming 21 hrs is 100%
    },
    subjects,
  };
};

const getDashboard = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("📊 Fetching dashboard data for teacher ID:", id);

    const [scheduleOverviewData, availabilityOverviewData, loadOverviewData] =
      await Promise.all([
        scheduleOverview(id).catch((err) => {
          console.error("❌ scheduleOverview error:", err);
          throw new Error(`Schedule overview failed: ${err.message}`);
        }),
        availabilityOverview(id).catch((err) => {
          console.error("❌ availabilityOverview error:", err);
          throw new Error(`Availability overview failed: ${err.message}`);
        }),
        loadOverview(id).catch((err) => {
          console.error("❌ loadOverview error:", err);
          throw new Error(`Load overview failed: ${err.message}`);
        }),
      ]);

    const response = {
      scheduleOverview: scheduleOverviewData,
      availabilityOverview: availabilityOverviewData,
      loadOverview: loadOverviewData,
    };

    return res.status(200).json({
      title: "Success",
      message: "Dashboard data retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Error retrieving dashboard data:", error.message);
    console.error("❌ Full error:", error);

    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

const getMySchedules = async (req, res) => {
  const { id } = req.params;
  const { semester, school_year } = req.query;

  try {
    // Get current academic period if no parameters provided
    let academicPeriodId = null;
    if (semester && school_year) {
      const { data: periodData } = await supabase
        .from("academic_periods")
        .select("id")
        .eq("semester", semester)
        .eq("school_year", school_year)
        .eq("is_current", true)
        .maybeSingle();

      academicPeriodId = periodData?.id;
    } else {
      const currentPeriod = await getCurrentAcademicPeriod(supabase);
      academicPeriodId = currentPeriod?.id;
    }

    let query = supabase
      .from("teacher_schedules")
      .select(getMySchedulesQuery)
      .eq("teacher_id", id);

    // Filter by academic period if available
    if (academicPeriodId) {
      query = query.eq("academic_period_id", academicPeriodId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Return raw schedule data with days field so frontend can map to correct week dates
    const schedules = data.map((item, index) => ({
      id: item.id || `schedule-${index + 1}`,
      teacher_id: item.teacher_id,
      subject_id: item.subjects?.id,
      room_id: item.rooms?.id,
      section_id: item.sections?.id,
      start_time: item.start_time, // e.g., "13:00:00"
      end_time: item.end_time, // e.g., "15:00:00"
      total_count: item.total_count || 0,
      semester: item.semester,
      school_year: item.school_year,
      days: item.days, // e.g., "MWF" or "TTh"
      total_duration: item.total_duration,
      created_at: item.created_at,
      updated_at: item.updated_at,
      created_by: item.created_by,
      // Nested objects for frontend compatibility
      subject: {
        id: item.subjects?.id,
        subject_code: item.subjects?.subject_code,
        subject: item.subjects?.subject,
        units: item.subjects?.units,
      },
      room: {
        id: item.rooms?.id,
        room_id: item.rooms?.room_id,
        room_title: item.rooms?.room_title || "TBA",
      },
      section: {
        id: item.sections?.id,
        name: item.sections?.name || "Unknown",
      },
    }));

    return res.status(200).json({
      title: "Success",
      message: "Schedules get successfully.",
      data: schedules,
    });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getMyLoad = async (req, res) => {
  const { id } = req.params;
  const { semester, school_year } = req.query;

  try {
    // Get current academic period if no parameters provided
    let academicPeriodId = null;
    if (semester && school_year) {
      const { data: periodData } = await supabase
        .from("academic_periods")
        .select("id")
        .eq("semester", semester)
        .eq("school_year", school_year)
        .eq("is_current", true)
        .maybeSingle();

      academicPeriodId = periodData?.id;
    } else {
      const currentPeriod = await getCurrentAcademicPeriod(supabase);
      academicPeriodId = currentPeriod?.id;
    }

    let query = supabase
      .from("teacher_schedules")
      .select(getMyLoadQuery)
      .eq("teacher_id", id);

    // Filter by academic period if available
    if (academicPeriodId) {
      query = query.eq("academic_period_id", academicPeriodId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by subject + section
    const grouped = {};

    data.forEach((entry) => {
      const subjKey = `${entry.subjects.id}-${entry.sections.id}`;

      if (!grouped[subjKey]) {
        grouped[subjKey] = {
          id: entry.subjects.id,
          code: entry.subjects.subject_code,
          name: entry.subjects.subject,
          department: entry.teacher_profile?.departments?.name || null,
          credits: entry.subjects.units,
          type: "lecture",
          semester:
            entry.semester === "1st" ? "First Semester" : "Second Semester",
          academicYear: entry.school_year,
          sections: [],
        };
      }

      let section = grouped[subjKey].sections.find(
        (s) => s.id === entry.sections.id
      );
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
      const dayMap = {
        M: "Monday",
        T: "Tuesday",
        W: "Wednesday",
        Th: "Thursday",
        F: "Friday",
      };
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
      title: "Success",
      message: "Schedules get successfully.",
      data: Object.values(grouped),
    });
  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getPrefTimeDay = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_profile")
      .select("avail_days, pref_time")
      .eq("id", id)
      .single();

    if (error || !data) throw error;

    const { avail_days, pref_time } = data;

    const availableDays = parseAvailableDays(avail_days); // from your utils
    const timeSlots = generateTimeSlots(); // e.g. returns ["08:00", ..., "17:00"]

    // Initialize availability object with all days and time slots set to false
    const availability = {};
    const allDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    allDays.forEach((day) => {
      const key = day.toLowerCase(); // convert "Monday" → "monday"
      availability[key] = {};
      timeSlots.forEach((slot) => {
        availability[key][slot] = false;
      });
    });

    // If there are available days and preferred time, mark those slots as available
    if (availableDays && availableDays.length > 0 && pref_time) {
      try {
        // Parse time range string (e.g. "09:00-17:00") to time slot array
        const [start, end] = pref_time.split("-");

        // Get only the relevant hours in the range
        const filteredSlots = timeSlots.filter(
          (slot) => slot >= start && slot <= end
        );

        // Mark available slots
        timeSlots.forEach((slot) => {
          availableDays.forEach((day) => {
            const key = day.toLowerCase(); // convert "Monday" → "monday"
            if (availability[key]) {
              availability[key][slot] = filteredSlots.includes(slot);
            }
          });
        });
      } catch (timeParseError) {
        console.error("Error parsing pref_time:", timeParseError);
        // Keep default availability (all false) if time parsing fails
      }
    }

    return res.status(200).json({
      title: "Success",
      message: "Schedules fetched successfully.",
      data: availability,
    });
  } catch (error) {
    console.error("Error fetching availability preferences:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong while fetching availability preferences!",
      data: null,
    });
  }
};

const savePrefTImeDay = async (req, res) => {
  try {
    const { id, workDays, workHours } = req.body;

    // Validate required fields
    if (!id) {
      return res.status(400).json({
        title: "Failed",
        message: "Teacher profile ID is required",
        data: null,
      });
    }

    // Handle empty arrays gracefully
    const abbreviatedDays =
      workDays && workDays.length > 0 ? generateDayAbbrev(workDays) : null;
    const timeRange =
      workHours && workHours.length > 0
        ? `${workHours[0]}-${workHours[workHours.length - 1]}`
        : null;

    const { data, error } = await supabase
      .from("teacher_profile")
      .update({
        avail_days: abbreviatedDays,
        pref_time: timeRange,
      })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      title: "Success",
      message: "Preferences saved successfully",
      data,
    });
  } catch (error) {
    console.error("Error saving availability preferences:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong while saving preferences!",
      data: null,
    });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Get teacher profile with user profile data
    const { data, error } = await supabase
      .from("teacher_profile")
      .select(
        `
        id,
        specializations,
        certifications,
        avail_days,
        pref_time,
        user_profile:teacher_profile_user_id_fkey (
          id,
          user_id,
          name,
          email,
          identity_id
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    // Parse specializations and certifications - they are stored as comma-separated strings
    const specializations = data.specializations
      ? data.specializations.split(",").map((s) => s.trim().replace(/"/g, ""))
      : [];
    const certifications = data.certifications
      ? data.certifications.split(",").map((c) => c.trim().replace(/"/g, ""))
      : [];

    // Check availability status
    const hasAvailDays = data.avail_days && data.avail_days.trim() !== "";
    const hasPrefTime = data.pref_time && data.pref_time.trim() !== "";
    const hasAvailability = hasAvailDays && hasPrefTime;

    const response = {
      id: data.id,
      employeeId: data.user_profile?.user_id || "",
      name: data.user_profile?.name || "Unnamed",
      email: data.user_profile?.email || "",
      identityId: data.user_profile?.identity_id || "",
      specializations,
      certifications,
      hasAvailability,
      needsAvailabilitySetup: !hasAvailability,
      needsSpecializationSetup: specializations.length === 0,
    };

    return res.status(200).json({
      title: "Success",
      message: "Profile retrieved successfully.",
      data: response,
    });
  } catch (error) {
    console.error("Error getting faculty profile:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { specializations, certifications } = req.body;

    // Validate input
    if (!Array.isArray(specializations) && !Array.isArray(certifications)) {
      return res.status(400).json({
        title: "Failed",
        message: "Invalid input data",
        data: null,
      });
    }

    const updateData = {};

    // Convert arrays to comma-separated strings with quotes for database storage
    if (Array.isArray(specializations)) {
      updateData.specializations = `"${specializations.join('", "')}"`;
    }

    if (Array.isArray(certifications)) {
      updateData.certifications = `"${certifications.join('", "')}"`;
    }

    const { data, error } = await supabase
      .from("teacher_profile")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      title: "Success",
      message: "Profile updated successfully.",
      data,
    });
  } catch (error) {
    console.error("Error updating faculty profile:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const checkMyAvailabilityStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("teacher_profile")
      .select(
        `
        id,
        avail_days,
        unavail_days,
        pref_time,
        user_profile:teacher_profile_user_id_fkey (
          id,
          name,
          email,
          user_id
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        title: "Failed",
        message: "Faculty profile not found.",
        data: null,
      });
    }

    // Check if faculty has availability settings
    const hasAvailDays = data.avail_days && data.avail_days.trim() !== "";
    const hasPrefTime = data.pref_time && data.pref_time.trim() !== "";

    // Faculty has availability if they have both avail_days and pref_time
    const hasAvailability = hasAvailDays && hasPrefTime;

    const response = {
      id: data.id,
      employeeId: data.user_profile?.user_id || "",
      name: data.user_profile?.name || "Unnamed",
      email: data.user_profile?.email || "",
      availDays: data.avail_days || "",
      unavailDays: data.unavail_days || "",
      prefTime: data.pref_time || "",
      hasAvailability,
      needsAvailabilitySetup: !hasAvailability,
      availabilityStatus: hasAvailability ? "complete" : "incomplete",
    };

    return res.status(200).json({
      title: "Success",
      message: "Availability status retrieved successfully.",
      data: response,
    });
  } catch (error) {
    console.error("Error checking faculty availability status:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const checkOnboardingStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get teacher profile data
    const { data, error } = await supabase
      .from("teacher_profile")
      .select(
        `
        id,
        specializations,
        certifications,
        avail_days,
        pref_time,
        user_profile:teacher_profile_user_id_fkey (
          id,
          user_id,
          name,
          email,
          identity_id
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    // Parse specializations and certifications as comma-separated strings
    const specializations = data.specializations
      ? data.specializations.split(",").map((s) => s.trim().replace(/"/g, ""))
      : [];
    const certifications = data.certifications
      ? data.certifications.split(",").map((c) => c.trim().replace(/"/g, ""))
      : [];

    // Check availability status
    const hasAvailDays = data.avail_days && data.avail_days.trim() !== "";
    const hasPrefTime = data.pref_time && data.pref_time.trim() !== "";
    const hasAvailability = hasAvailDays && hasPrefTime;

    // Check if onboarding is needed
    const needsSpecializationSetup = specializations.length === 0;
    const needsAvailabilitySetup = !hasAvailability;
    const needsOnboarding = needsSpecializationSetup || needsAvailabilitySetup;

    const response = {
      id: data.id,
      employeeId: data.user_profile?.user_id || "",
      name: data.user_profile?.name || "Unnamed",
      email: data.user_profile?.email || "",
      needsOnboarding,
      needsSpecializationSetup,
      needsAvailabilitySetup,
      hasSpecializations: specializations.length > 0,
      hasAvailability,
      onboardingStatus: needsOnboarding ? "incomplete" : "complete",
    };

    return res.status(200).json({
      title: "Success",
      message: "Onboarding status retrieved successfully.",
      data: response,
    });
  } catch (error) {
    console.error("Error checking faculty onboarding status:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getDashboard,
  getMySchedules,
  getMyLoad,
  getPrefTimeDay,
  savePrefTImeDay,
  checkMyAvailabilityStatus,
  getMyProfile,
  updateMyProfile,
  checkOnboardingStatus,
};

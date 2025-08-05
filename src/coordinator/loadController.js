const supabase = require("../../supabase");
const getLoadQuery = require("../queries/coordinator").getLoadQuery;
const {
  parseAvailableDays,
  toMinutes,
  overlap,
  generateTimeDaySlots,
} = require("../utils.js");

const getLoad = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .select(getLoadQuery);

    if (error) throw error;

    const grouped = {};

    for (const sched of data) {
      const profile = sched.teacher_profile;
      const user = profile.user_profile;
      const teacherId = user.id;

      if (!grouped[teacherId]) {
        const specializations = profile.specializations
          ? profile.specializations.replace(/(^"|"$)/g, "").split('", "')
          : [];

        const qualifications = profile.qualifications
          ? profile.qualifications.split(",").map((q) => q.trim())
          : [];

        const maxLoad = profile.positions?.max_load || 0;

        grouped[teacherId] = {
          id: teacherId,
          employeeId: user.user_id,
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ")[1] || "",
          middleName: "", // Optional field
          email: user.email,
          department: profile.departments?.name,
          position: profile.positions?.position,
          profileImage: user.profile_image,
          assignedSubjects: [],
          totalUnits: 0,
          totalTeachingHours: 0,
          maxLoad,
          availableUnits: 0,
          loadStatus: "",
          utilizationPercentage: 0,
          preferredDays: parseAvailableDays(profile.avail_days || ""),
          preferredTimeSlots: profile.pref_time ? [profile.pref_time] : [],
          unavailableDays: parseAvailableDays(profile.unavail_days || ""),
          contractType: profile.contract_type,
          employmentStatus: user.status ? "Active" : "Inactive",
          specializations,
          canTeachSubjects: qualifications,
          yearsOfExperience: 8, // placeholder
          lastAssignmentDate: sched.start_time,
        };
      }

      const hours = parseInt(sched.total_duration?.split(":")[0]) || 0;

      grouped[teacherId].assignedSubjects.push({
        id: sched.subjects?.id,
        name: sched.subjects?.subject,
        code: sched.subjects?.subject_code,
        units: sched.subjects?.units,
        hours,
        semester: sched.subjects?.semester,
        academicYear: sched.subjects?.school_year,
        section: sched.sections?.name,
        enrollmentCount: sched.total_count,
        scheduleTime: `${sched.days} ${sched.start_time.slice(
          0,
          5
        )}-${sched.end_time.slice(0, 5)}`,
        room: sched.rooms?.room_id,
      });

      grouped[teacherId].totalUnits += sched.subjects?.units || 0;
      grouped[teacherId].totalTeachingHours += hours;

      if (sched.created_at > grouped[teacherId].lastAssignmentDate) {
        grouped[teacherId].lastAssignmentDate = sched.created_at;
      }
    }

    const result = Object.values(grouped).map((fac) => {
      const maxLoad = fac.maxLoad || 0;

      let loadStatus = "Normal";
      if (fac.totalUnits > maxLoad) {
        loadStatus = "Overloaded";
      } else if (fac.totalUnits < maxLoad) {
        loadStatus = "Underloaded";
      }
      fac.loadStatus = loadStatus;
      fac.availableUnits = fac.maxLoad - fac.totalUnits;
      fac.utilizationPercentage = parseFloat(
        ((fac.totalUnits / fac.maxLoad) * 100).toFixed(1)
      );
      return fac;
    });

    return res.status(200).json({
      title: "Success",
      message: "Load retrieved successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Error retrieving load:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const addSubject = async (req, res) => {
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
      school_year,
    } = req.body;

    days = abbreviateDays(days);
    const { data, error } = await supabase
      .from("teacher_schedules")
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
        school_year,
      })
      .select();

    if (error) throw error;

    return res.status(201).json({
      title: "Success",
      message: "Subject added successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error adding subject:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const removeSubject = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Subject removed successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error removing subject:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const reassignSubject = async (req, res) => {
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
    school_year,
  } = req.body;

  try {
    days = abbreviateDays(days);
    const { data, error } = await supabase
      .from("teacher_schedules")
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
        school_year,
      })
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Subject reassigned successfully.",
      data: data[0],
    });
  } catch (error) {
    console.error("Error reassigning subject:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// const instructors = [
//   {
//     name: "Dr. Maria Smith",
//     role: "Instructor",
//     maxLoad: 18,
//     canTeach: ["ENG101", "ENG102"],
//     timePref: { start: "09:00", end: "13:00" },
//     dayPref: ["Monday", "Wednesday", "Friday"]
//   }
// ];

// const subjects = [
//   {
//     name: "ENG101",
//     schedule: { day: "Tuesday", start: "09:00", end: "10:30", section: "A" },
//     load: 3
//   },
// ];

// const rooms = [
//   { id: "R101", capacity: 30 },
// ]


const getTeachers = async () => {
  const { data, error } = await supabase
    .from('teacher_profile')
    .select(`
        id,
        current_load,
        avail_days,
        user_profile:teacher_profile_user_id_fkey (
          id,
          name,
          email
        ),
        positions:user_roles_position_id_fkey (
          id,
          position,
          max_load,
          min_load
        ),
        departments:user_roles_department_id_fkey (
          id,
          name
        )
      `);

  if (error) {
    console.error('Error fetching teachers:', error.message);
    throw error;
  }

  return data;
};

const getRooms = async () => {
  const { data, error } = await supabase
    .from('room')
    .select(`
        id,
        room_id,
        room_title,
        room_desc,
        status,
        floor
      `);

  if (error) {
    console.error('Error fetching rooms:', error.message);
    throw error;
  }

  return data;
};

const getSubjects = async () => {
  const { data, error } = await supabase
    .from('subjects')
    .select(`
        id,
        subject,
        subject_code,
        units,      
        semester,
        school_year,
        total_hours    
      `);

  if (error) {
    console.error('Error fetching subjects:', error.message);
    throw error;
  }

  return data;
};

const getSections = async () => {
  const { data, error } = await supabase
    .from("sections")
    .select("id, name")

  if (error) {
    console.error('Error fetching subjects:', error.message);
    throw error;
  }

  return data;
}

const dayAbbrevMap = {
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "Th",
  Friday: "F"
};
const calculateDurationInTimeFormat = (start, end) => {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  let durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

  const hours = Math.floor(durationMinutes / 60).toString().padStart(2, '0');
  const minutes = (durationMinutes % 60).toString().padStart(2, '0');

  return `${hours}:${minutes}`;
};


const availableDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];


function generateDayBundles(days = availableDays, lengths = [2, 3]) {
  const result = [];

  const combine = (arr, len, start = 0, temp = []) => {
    if (temp.length === len) {
      result.push([...temp]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      temp.push(arr[i]);
      combine(arr, len, i + 1, temp);
      temp.pop();
    }
  };

  lengths.forEach(len => combine(days, len));
  return result;
}

const scoreDayBundle = (bundle, preferredDays) => {
  return bundle.reduce((score, day) => preferredDays.includes(day) ? score + 1 : score, 0);
};

const prioritizeBundlesForTeacher = (allBundles, preferredDays, useStrict = false) => {
  const filtered = useStrict
    ? allBundles.filter(bundle =>
      bundle.every(day => preferredDays.includes(day))
    )
    : allBundles;

  return filtered
    .map(bundle => ({
      bundle,
      score: scoreDayBundle(bundle, preferredDays),
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.bundle);
};

const getDurationCombinations = (totalHours) => {
  const validDurations = [1, 1.5, 2, 3];
  const results = [];

  const backtrack = (remain, combo = []) => {
    if (remain === 0) {
      results.push([...combo]);
      return;
    }

    for (let dur of validDurations) {
      if (dur <= remain) {
        combo.push(dur);
        backtrack(remain - dur, combo);
        combo.pop();
      }
    }
  };

  backtrack(totalHours);
  return results.sort((a, b) => a.length - b.length); // Try fewer sessions first
};

const calculateDurationInHours = (start, end) => {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return (endMinutes - startMinutes) / 60;
};



const runAutoSchedule = async (req, res) => {
  try {
    const [teachers, rooms, subjects, sections] = await Promise.all([
      getTeachers(),
      getRooms(),
      getSubjects(),
      getSections(),
    ]);

    const schedule = {};
    const loadMap = {};
    const roomBookings = {};
    const unassigned = [];
    const conflictNarratives = [];

    const timeSlots = generateTimeDaySlots({
      startTime: "08:00",
      endTime: "18:00",
      slotDuration: 60,
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    });

    const allDayBundles = generateDayBundles(availableDays, [2, 3]);

    const instructors = teachers.map((teacher) => {
      const fullName = teacher.user_profile?.name || "Unnamed";
      const maxLoad = teacher.positions?.max_load || 18;
      const availDays = parseAvailableDays(teacher.avail_days);

      return {
        id: teacher.id,
        name: fullName,
        maxLoad,
        currentLoad: teacher.current_load || 0,
        dayPref: availDays.length ? availDays : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        timePref: { start: "08:00", end: "18:00" },
      };
    });

    const getRandomSection = () =>
      sections[Math.floor(Math.random() * sections.length)];

    const getSortedInstructors = () =>
      [...instructors].sort(
        (a, b) => (loadMap[a.name] || 0) - (loadMap[b.name] || 0)
      );

    const isRoomAvailable = (room, day, start, end) => {
      const bookings = roomBookings[day] || [];
      return !bookings.some((b) => b.room.id === room.id && overlap(b, { start, end }));
    };
    for (const subject of subjects) {
      let assigned = false;

      for (const slot of timeSlots) {
        for (const instructor of getSortedInstructors()) {

          const preferredBundles = prioritizeBundlesForTeacher(allDayBundles, instructor.dayPref, true);
          const currentSchedule = schedule[instructor.name] || [];
          const currentLoad = loadMap[instructor.name] || 0;

          if (currentLoad + subject.units > instructor.maxLoad) continue;

          let bundleAssigned = false;

          for (const bundle of preferredBundles) {
            if (bundle.length < subject.units) continue;

            const durationCombos = getDurationCombinations(subject.units);
            let assignedCombo = null;

            for (const durations of durationCombos) {
              if (durations.length > bundle.length) continue;

              const sessions = bundle.slice(0, durations.length);
              const sessionAssignments = [];

              for (let i = 0; i < durations.length; i++) {
                const day = sessions[i];
                const availableSlots = timeSlots.filter(
                  s => s.day === day &&
                    parseFloat(calculateDurationInHours(s.start, s.end)) >= durations[i]
                );

                let found = null;
                for (const slot of availableSlots) {
                  const { start, end } = slot;
                  const instructorBusy = currentSchedule.some(cls =>
                    cls.day === day && overlap(cls, { start, end })
                  );

                  if (instructorBusy) continue;

                  const room = rooms.find(r => isRoomAvailable(r, day, start, end));
                  if (!room) continue;

                  found = { day, start, end, room, duration: durations[i] };
                  break;
                }

                if (found) sessionAssignments.push(found);
              }

              if (sessionAssignments.length === durations.length) {
                assignedCombo = sessionAssignments;
                break;
              }
            }

            if (assignedCombo) {
              const section = getRandomSection();

              const newClasses = assignedCombo.map(sa => ({
                day: sa.day,
                start: sa.start,
                end: sa.end,
                subject: subject.subject,
                subjectCode: subject.subject_code,
                section: section.name,
                sectionId: section.id,
                room: sa.room.room_id,
                roomTitle: sa.room.room_title,
                units: sa.duration,
              }));

              schedule[instructor.name] = [...currentSchedule, ...newClasses];

              for (const sa of assignedCombo) {
                roomBookings[sa.day] = [...(roomBookings[sa.day] || []), { start: sa.start, end: sa.end, room: sa.room }];
              }

              loadMap[instructor.name] = currentLoad + subject.units;
              bundleAssigned = true;
              break;
            }

          }

          if (bundleAssigned) break;
        }


        if (assigned) break;
      }

      if (!assigned) {
        unassigned.push(subject.subject_code);
        conflictNarratives.push(`Could not assign ${subject.subject} (${subject.subject_code}).`);
      }
    }

    const conflictAnalysis = conflictNarratives.map((narrative) => {
      let tag = "Other", title = "Scheduling Issue", severity = "Low";
      if (narrative.includes("schedule conflict")) {
        tag = "Time Conflict"; title = "Instructor Time Overlap"; severity = "High";
      } else if (narrative.includes("unavailable on")) {
        tag = "Day Conflict"; title = "Unavailable on Assigned Day"; severity = "Medium";
      } else if (narrative.includes("unavailable at")) {
        tag = "Time Preference Conflict"; title = "Outside Preferred Time"; severity = "Medium";
      } else if (narrative.includes("max load")) {
        tag = "Overload Conflict"; title = "Exceeds Max Load"; severity = "High";
      } else if (narrative.includes("No available room")) {
        tag = "Room Conflict"; title = "No Room Available"; severity = "High";
      } else if (narrative.includes("Could not assign")) {
        tag = "Unassigned"; title = "Subject Unassigned"; severity = "High";
      }

      return {
        conflict_title: title,
        conflict_desc: narrative,
        affected_count: 1,
        tags: tag,
        severity: severity,
      };
    });

    // First, delete all existing schedules
    await supabase.from("teacher_schedules").delete().neq("id", 0);

    // Group similar schedules by teacher, subject, section, room, start/end time
    const groupedSchedules = {};

    Object.entries(schedule).forEach(([teacherName, classes]) => {
      const teacher = instructors.find((t) => t.name === teacherName);
      if (!teacher) return;

      classes.forEach((cls) => {
        const subject = subjects.find((s) => s.subject_code === cls.subjectCode);
        const room = rooms.find((r) => r.room_id === cls.room);
        const section = sections.find((s) => s.name === cls.section);

        const key = `${teacher.id}-${subject?.id}-${section?.id}-${room?.id}-${cls.start}-${cls.end}`;

        if (!groupedSchedules[key]) {
          groupedSchedules[key] = {
            teacher_id: teacher.id,
            subject_id: subject?.id || null,
            section_id: section?.id || null,
            room_id: room?.id || null,
            start_time: cls.start,
            end_time: cls.end,
            days: [],
            semester: subject?.semester || null,
            school_year: subject?.school_year || null,
            total_count: Math.floor(Math.random() * 21) + 30,
            total_duration: calculateDurationInTimeFormat(cls.start, cls.end),
          };
        }

        groupedSchedules[key].days.push(cls.day);
      });
    });

    // Map full day names to abbreviations
    const dayAbbrevMap = {
      Monday: "M",
      Tuesday: "T",
      Wednesday: "W",
      Thursday: "Th",
      Friday: "F",
    };

    // Insert grouped schedules
    const insertPromises = Object.values(groupedSchedules).map((entry) => {
      const abbrevDays = entry.days
        .map((day) => dayAbbrevMap[day] || day.slice(0, 2))
        .sort((a, b) => {
          const order = { M: 1, T: 2, W: 3, Th: 4, F: 5 };
          return (order[a] || 99) - (order[b] || 99);
        })
        .join("");

      return supabase.from("teacher_schedules").insert({
        ...entry,
        days: abbrevDays,
      });
    });

    const insertResults = await Promise.all(insertPromises);
    const insertErrors = insertResults.filter(r => r.error);

    
    await supabase.from("conflicts").delete().neq("id", 0);
    const conflictInsertPromises = conflictAnalysis.map(conflict =>
      supabase.from("conflicts").insert(conflict)
    );
    const conflictInsertResults = await Promise.all(conflictInsertPromises);
    const conflictInsertErrors = conflictInsertResults.filter(r => r.error);

    if (insertErrors.length > 0 || conflictInsertErrors.length > 0) {
      console.warn("Rolling back due to insert error.");

      await supabase.from("teacher_schedules").delete().neq("id", 0);
      await supabase.from("conflicts").delete().neq("id", 0);

      return res.status(500).json({
        title: "Rollback",
        message: "Insert failed. Rollback performed.",
        scheduleInsertErrors: insertErrors.length,
        conflictInsertErrors: conflictInsertErrors.length,
      });
    }

    return res.status(200).json({
      title: "Success",
      message: "Auto-scheduling complete.",
      data: {
        schedule,
        loadMap,
        unassigned,
        roomBookings,
        conflictNarratives,
        diagnostics: conflictAnalysis,
        insertedSchedules: insertPromises.length,
        failedInsertions: insertErrors.length,

      },
    });
  } catch (error) {
    console.error("Scheduling error:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong.",
      error: error.message,
    });
  }
};


const getConflicts = async (req, res) => {
  try {
    const { data, error } = await supabase.from("conflicts").select("*");

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Conflicts retrieved successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error retrieving conflicts:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const updateConflict = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { data, error } = await supabase
      .from("conflicts")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Conflict updated successfully.",
      data: data[0],
    });
  } catch (error) {
    console.error("Error updating conflict:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getLoad,
  addSubject,
  removeSubject,
  reassignSubject,
  runAutoSchedule,
  getConflicts,
  updateConflict,
};

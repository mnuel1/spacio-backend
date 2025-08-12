const supabase = require("../../supabase");
const getLoadQuery = require("../queries/coordinator").getLoadQuery;
const {
  parseAvailableDays,
  toMinutes,
  overlap,
  toHHMM,
  getRandomInt,
  generateTimeDaySlots,
  getRandomSection,
  isRoomAvailable,
  calculateDurationInTimeFormat
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
      total_count,
      semester,
      school_year,
    } = req.body;

    // Get teacher + min_load from position
    const { data: teacherData, error: teacherError } = await supabase
      .from("teacher_profile")
      .select(`
        current_load,
        position_id,
        positions!inner (
          min_load
        )
      `)
      .eq("id", teacher_id)
      .single();

    if (teacherError) throw teacherError;
    if (!teacherData) {
      return res.status(404).json({
        title: "Failed",
        message: "Teacher not found.",
      });
    }

    // Get subject units
    const { data: subjectData, error: subjectError } = await supabase
      .from("subjects")
      .select("units")
      .eq("id", subject_id)
      .single();

    if (subjectError) throw subjectError;
    if (!subjectData) {
      return res.status(404).json({
        title: "Failed",
        message: "Subject not found.",
      });
    }

    const { current_load, positions } = teacherData;
    const min_load = positions?.min_load || 0;
    const { units } = subjectData;

    // Check load limit
    if (current_load + units > min_load + 12) {
      return res.status(400).json({
        title: "Failed",
        message: `Cannot assign subject. Adding ${units} units will exceed the allowed load (${min_load + 12}).`,
      });
    }

    const abbrevDays = abbreviateDays(days);

    // ===== Check 1: Room conflict =====
    const { data: roomConflict, error: roomError } = await supabase
      .from("teacher_schedules")
      .select("id")
      .eq("room_id", room_id)
      .eq("days", abbrevDays)
      .eq("start_time", start_time)
      .eq("end_time", end_time);

    if (roomError) throw roomError;
    if (roomConflict.length > 0) {
      return res.status(400).json({
        title: "Failed",
        message: "Room is already booked at this time on this day.",
      });
    }

    // ===== Check 2: Same section + subject same day =====
    const { data: sectionConflict, error: sectionError } = await supabase
      .from("teacher_schedules")
      .select("id")
      .eq("section_id", section_id)
      .eq("subject_id", subject_id)
      .eq("days", abbrevDays);

    if (sectionError) throw sectionError;
    if (sectionConflict.length > 0) {
      return res.status(400).json({
        title: "Failed",
        message: "This section already has this subject on the same day.",
      });
    }

    // Calculate total duration (if you have this helper)
    const total_duration = calculateDurationInTimeFormat(start_time, end_time);

    // Insert subject
    const { data, error } = await supabase
      .from("teacher_schedules")
      .insert({
        subject_id,
        teacher_id,
        section_id,
        room_id,
        days: abbrevDays,
        start_time,
        end_time,
        total_count,
        semester,
        school_year,
        total_duration
      })
      .select();

    if (error) throw error;

    // Update teacher's current load
    await supabase
      .from("teacher_profile")
      .update({ current_load: current_load + units })
      .eq("id", teacher_id);

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

  let updateFields = { ...req.body };

  try {

    if (updateFields.days) {
      updateFields.days = abbreviateDays(updateFields.days);
    }

    const { data, error } = await supabase
      .from("teacher_schedules")
      .update(
        updateFields
      )
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

const getTeachers = async () => {
  const { data, error } = await supabase.from("teacher_profile").select(`
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
    console.error("Error fetching teachers:", error.message);
    throw error;
  }

  return data;
};

const getRooms = async () => {
  const { data, error } = await supabase.from("room").select(`
        id,
        room_id,
        room_title,
        room_desc,
        status,
        floor
      `);

  if (error) {
    console.error("Error fetching rooms:", error.message);
    throw error;
  }

  return data;
};

const getSubjects = async () => {
  const { data, error } = await supabase.from("subjects").select(`
        id,
        subject,
        subject_code,
        units,      
        semester,
        school_year,
        total_hours    
      `);

  if (error) {
    console.error("Error fetching subjects:", error.message);
    throw error;
  }

  return data;
};

const getSections = async () => {
  const { data, error } = await supabase
    .from("sections")
    .select(`
      id,
      name,
      student_sections:student_sections(count)
    `);

  if (error) {
    console.error("Error fetching sections:", error.message);
    throw error;
  }

  const sectionsWithCount = data.map(section => ({
    ...section,
    total_count: section.student_sections[0]?.count || 0
  }));

  return sectionsWithCount;
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
    const dailySubjectCount = {};
    const roomBookings = {};
    const instructorBookings = {};
    const unassigned = [];
    const sectionSubjectDays = {};

    const instructors = teachers
      .filter((teacher) => teacher.positions?.max_load)
      .map((teacher) => {
        const fullName = teacher.user_profile?.name || "Unnamed";
        const maxLoad = teacher.positions?.max_load || 18;
        const availDays = parseAvailableDays(teacher.avail_days);

        return {
          id: teacher.id,
          name: fullName,
          maxLoad,
          currentLoad: teacher.current_load || 0,
          dayPref: availDays.length
            ? availDays
            : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          timePref: { start: "08:00", end: "18:00" },
        };
      });

    const isRoomFree = (roomId, day, start, end) => {
      if (!roomBookings[roomId]) roomBookings[roomId] = {};
      if (!roomBookings[roomId][day]) return true;
      return !roomBookings[roomId][day].some(
        (b) => !(end <= b.start || start >= b.end)
      );
    };

    const isInstructorFree = (instructorId, day, start, end) => {
      if (!instructorBookings[instructorId]) instructorBookings[instructorId] = {};
      if (!instructorBookings[instructorId][day]) return true;
      return !instructorBookings[instructorId][day].some(
        (b) => !(end <= b.start || start >= b.end)
      );
    };

    const bookRoom = (roomId, day, start, end) => {
      if (!roomBookings[roomId]) roomBookings[roomId] = {};
      if (!roomBookings[roomId][day]) roomBookings[roomId][day] = [];
      roomBookings[roomId][day].push({ start, end });
    };

    const bookInstructor = (instructorId, day, start, end) => {
      if (!instructorBookings[instructorId]) instructorBookings[instructorId] = {};
      if (!instructorBookings[instructorId][day]) instructorBookings[instructorId][day] = [];
      instructorBookings[instructorId][day].push({ start, end });
    };

    const splitUnitsToBlocks = (units) => {
      let remaining = units;
      const blocks = [];

      if (units <= 2) {
        // If the subject is 1 or 2 units, give it all in one block
        blocks.push(units);
        return blocks;
      }

      while (remaining > 0) {
        // Force at least 2 hours per meeting unless the remaining is less than 2
        const minBlock = Math.min(2, remaining);
        const maxBlock = remaining; // can use all remaining if needed
        const block = Math.max(minBlock, getRandomInt(minBlock, maxBlock));
        blocks.push(block);
        remaining -= block;
      }

      return blocks;
    };


    for (const instructor of instructors) {

      schedule[instructor.name] = [];
      loadMap[instructor.name] = instructor.currentLoad;
      dailySubjectCount[instructor.id] = {};
      instructorBookings[instructor.id] = {};
      for (const day of instructor.dayPref) {
        dailySubjectCount[instructor.id][day] = 0;
        instructorBookings[instructor.id][day] = [];
      }

      for (const subject of subjects) {
        if (loadMap[instructor.name] + subject.units > instructor.maxLoad) {
          continue;
        }

        const section = getRandomSection(sections);
        if (!sectionSubjectDays[section.id]) sectionSubjectDays[section.id] = {};
        if (!sectionSubjectDays[section.id][subject.subject_code]) {
          sectionSubjectDays[section.id][subject.subject_code] = new Set();
        }

        const timeBlocks = splitUnitsToBlocks(subject.units);
        let allBlocksAssigned = true;

        for (const blockHours of timeBlocks) {
          let blockAssigned = false;

          for (const day of instructor.dayPref) {

            // prevent same section+subject on same day (global)
            if (sectionSubjectDays[section.id][subject.subject_code].has(day)) {
              continue; // try another day
            }

            if (dailySubjectCount[instructor.id][day] >= 3) continue; // max 3 subjects/day

            const prefStartMin = toMinutes(instructor.timePref.start);
            const prefEndMin = toMinutes(instructor.timePref.end);
            const durationMin = blockHours * 60;

            const earliestStart = prefStartMin;
            const latestStart = prefEndMin - durationMin;
            if (latestStart < earliestStart) continue;

            const randomStartMin = getRandomInt(earliestStart, latestStart);
            const randomEndMin = randomStartMin + durationMin;
            const startTime = toHHMM(randomStartMin);
            const endTime = toHHMM(randomEndMin);

            const availableRoom = rooms.find(
              (room) =>
                isRoomFree(room.id, day, startTime, endTime) &&
                isInstructorFree(instructor.id, day, startTime, endTime)
            );

            if (availableRoom) {
              schedule[instructor.name].push({
                subject: subject.subject,
                subject_code: subject.subject_code,
                section_id: section.id,
                section: section.name,
                day,
                start: startTime,
                end: endTime,
                room_title: availableRoom.room_title,
                room_id: availableRoom.room_id,
                units: blockHours,
              });

              loadMap[instructor.name] += blockHours;
              dailySubjectCount[instructor.id][day]++;
              bookRoom(availableRoom.id, day, startTime, endTime);
              bookInstructor(instructor.id, day, startTime, endTime);
              sectionSubjectDays[section.id][subject.subject_code].add(day);
              blockAssigned = true;
              break;
            }
          }

          if (!blockAssigned) {
            allBlocksAssigned = false;
            break;
          }
        }

        if (!allBlocksAssigned) {
          unassigned.push({
            subject,
            reason: `Could not fit all hours for ${instructor.name}`,
          });
        }
      }
    }

    await supabase.from("teacher_schedules").delete().neq("id", 0);
    const groupedSchedules = {};

    Object.entries(schedule).forEach(([teacherName, classes]) => {
      const teacher = instructors.find((t) => t.name === teacherName);
      if (!teacher) return;

      classes.forEach((cls) => {
        const subject = subjects.find(
          (s) => s.subject_code === cls.subject_code
        );

        const room = rooms.find((r) => r.room_id === cls.room_id);
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
            total_count: section.total_count,
            total_duration: calculateDurationInTimeFormat(cls.start, cls.end),
          };
        }

        groupedSchedules[key].days.push(cls.day);
      });
    });

    const dayAbbrevMap = {
      Monday: "M",
      Tuesday: "T",
      Wednesday: "W",
      Thursday: "Th",
      Friday: "F",
    };

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
    const insertErrors = insertResults.filter((r) => r.error);

    const updatePromises = Object.entries(loadMap).map(async ([teacherName, load]) => {
      const teacher = instructors.find((t) => t.name === teacherName);
      if (!teacher) return null;

      return supabase
        .from("teacher_profile")
        .update({ current_load: load })
        .eq("id", teacher.id);
    });

    await Promise.all(updatePromises);

    return res.status(200).json({
      title: "Success",
      message: "Schedule generated",
      data: { schedule, unassigned, loadMap },
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
    const { data: schedules, error } = await supabase
      .from("teacher_schedules")
      .select(`
        id,
        teacher_id,
        subject_id,
        section_id,
        room_id,
        days,
        start_time,
        end_time,
        subjects ( subject_code, subject ),
        sections ( name ),
        teacher_profile ( user_profile ( name ) )
      `);

    if (error) throw error;

    const conflicts = [];
    const toMinutes = (time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i];
        const b = schedules[j];
        if (a.room_id === b.room_id && a.days === b.days) {
          const overlap = !(
            toMinutes(a.end_time) <= toMinutes(b.start_time) ||
            toMinutes(a.start_time) >= toMinutes(b.end_time)
          );
          if (overlap) {
            conflicts.push({
              type: "Room Conflict",
              message: `Room conflict: "${a.subjects.subject}" for section "${a.sections.name}" overlaps with "${b.subjects.subject}" for section "${b.sections.name}" in the same room on ${a.days} (${a.start_time}-${a.end_time} vs ${b.start_time}-${b.end_time})`,
              entries: [a, b],
            });
          }
        }
      }
    }

    const seenSectionSubjectDay = {};
    schedules.forEach((sched) => {
      const key = `${sched.section_id}-${sched.subject_id}-${sched.days}`;
      if (!seenSectionSubjectDay[key]) {
        seenSectionSubjectDay[key] = sched;
      } else {
        const first = seenSectionSubjectDay[key];
        conflicts.push({
          type: "Duplicate Section/Subject Conflict",
          message: `Duplicate subject for same section: "${sched.subjects.subject}" is scheduled twice for section "${sched.sections.name}" on ${sched.days}`,
          entries: [first, sched],
        });
      }
    });

    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i];
        const b = schedules[j];
        if (a.teacher_id === b.teacher_id && a.days === b.days) {
          const overlap = !(
            toMinutes(a.end_time) <= toMinutes(b.start_time) ||
            toMinutes(a.start_time) >= toMinutes(b.end_time)
          );
          if (overlap) {
            conflicts.push({
              type: "Instructor Conflict",
              message: `Instructor conflict: "${a.teacher_profile.user_profile.name}" is scheduled to teach "${a.subjects.subject}" and "${b.subjects.subject}" at overlapping times on ${a.days} (${a.start_time}-${a.end_time} vs ${b.start_time}-${b.end_time})`,
              entries: [a, b],
            });
          }
        }
      }
    }

    const { data: allSubjects, error: subjError } = await supabase
      .from("subjects")
      .select("id, subject");

    if (subjError) throw subjError;

    const assignedSubjectIds = new Set(schedules.map((s) => s.subject_id));
    allSubjects.forEach((subj) => {
      if (!assignedSubjectIds.has(subj.id)) {
        conflicts.push({
          type: "Unassigned Subject",
          message: `Unassigned subject: "${subj.subject}" is not scheduled for any section or instructor.`,
          entries: [subj],
        });
      }
    });

    return res.status(200).json({
      title: "Success",
      message: "Conflicts.",
      data: conflicts,
    });
  } catch (error) {
    console.error("Error fetching conflict:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};


const updateConflict = async (req, res) => {
  const { id } = req.params;
  const { status, assigned_to, solution_details, notes, resolution_type } =
    req.body;

  try {
    // Build update object with only provided fields
    const updateData = { status };

    if (assigned_to !== undefined) {
      updateData.assigned_to = assigned_to;
      updateData.assigned_at = new Date().toISOString();
    }

    if (solution_details !== undefined) {
      updateData.solution_details = solution_details;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (resolution_type !== undefined) {
      updateData.resolution_type = resolution_type;
      if (resolution_type === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("conflicts")
      .update(updateData)
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

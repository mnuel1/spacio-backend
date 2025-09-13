const supabase = require("../../supabase");
const getLoadQuery = require("../queries/coordinator").getLoadQuery;
const {
  parseAvailableDays,
  toMinutes,
  overlap,
  toHHMM,
  getRandomInt,
  roundToSlot,
  generateTimeDaySlots,
  getRandomSection,
  isRoomAvailable,
  calculateDurationInTimeFormat,
} = require("../utils.js");

const getLoad = async (req, res) => {
  try {
    // Get all faculty profiles first
    const { data: facultyData, error: facultyError } = await supabase
      .from("teacher_profile")
      .select(
        `
        id,
        current_load,
        contract_type,
        specializations, 
        qualifications,
        avail_days,
        unavail_days,
        pref_time,
        user_profile:teacher_profile_user_id_fkey (
          id, user_id, name, email, profile_image, status
        ),
        positions:user_roles_position_id_fkey (
          id, position, max_load, min_load
        ),
        departments:user_roles_department_id_fkey (
          id, name
        )
      `
      )
      .not("position_id", "is", null); // exclude teachers without position_id

    if (facultyError) throw facultyError;

    // Get all schedules separately
    const { data: scheduleData, error: scheduleError } = await supabase.from(
      "teacher_schedules"
    ).select(`
        id,
        teacher_id,
        days,
        start_time,
        end_time,
        total_count,
        total_duration,
        semester,
        school_year,
        created_at,
        subjects:teacher_schedules_subject_id_fkey (
          id, subject_code, subject, total_hours, units, semester, school_year
        ),
        sections:teacher_schedules_section_id_fkey (
          id, name
        ),
        rooms:teacher_schedules_room_id_fkey (
          id, room_id, room_title, room_desc, status, floor
        )
      `);

    if (scheduleError) throw scheduleError;

    // Group schedules by teacher_id
    const schedulesByTeacher = {};
    scheduleData.forEach((sched) => {
      if (!schedulesByTeacher[sched.teacher_id]) {
        schedulesByTeacher[sched.teacher_id] = [];
      }
      schedulesByTeacher[sched.teacher_id].push(sched);
    });

    // Build result with all faculty, including those with no schedules
    const result = facultyData.map((profile) => {
      const user = profile.user_profile;
      const teacherId = profile.id;
      const teacherSchedules = schedulesByTeacher[teacherId] || [];

      const specializations = profile.specializations
        ? profile.specializations.replace(/(^"|"$)/g, "").split('", "')
        : [];

      const qualifications = profile.qualifications
        ? profile.qualifications.split(",").map((q) => q.trim())
        : [];

      const maxLoad = (profile.positions?.min_load || 0) + 12;

      // Calculate assigned subjects and totals
      const assignedSubjects = [];
      let totalUnits = 0;
      let totalTeachingHours = 0;
      let lastAssignmentDate = null;

      teacherSchedules.forEach((sched) => {
        const hours = parseInt(sched.total_duration?.split(":")[0]) || 0;

        assignedSubjects.push({
          id: sched.id, // Use schedule ID, not subject ID
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

        totalUnits += hours || 0;
        totalTeachingHours += hours;

        if (!lastAssignmentDate || sched.created_at > lastAssignmentDate) {
          lastAssignmentDate = sched.created_at;
        }
      });

      // Determine load status
      const currentLoad = profile.current_load || 0;
      let loadStatus = "Normal";
      if (currentLoad > maxLoad) {
        loadStatus = "Overloaded";
      } else if (currentLoad < maxLoad) {
        loadStatus = "Underloaded";
      }

      return {
        id: teacherId, // This is the teacher_profile.id, which is what we need for scheduling
        employeeId: user?.user_id || "",
        firstName: user?.name?.split(" ")[0] || "",
        lastName: user?.name?.split(" ")[1] || "",
        middleName: "", // Optional field
        email: user?.email || "",
        department: profile.departments?.name || "No Department",
        position: profile.positions?.position || "No Position",
        profileImage: user?.profile_image,
        assignedSubjects,
        totalUnits,
        totalTeachingHours,
        maxLoad,
        availableUnits: maxLoad - totalUnits,
        loadStatus,
        utilizationPercentage:
          maxLoad > 0
            ? parseFloat(((totalUnits / maxLoad) * 100).toFixed(1))
            : 0,
        preferredDays: parseAvailableDays(profile.avail_days || ""),
        preferredTimeSlots: profile.pref_time ? [profile.pref_time] : [],
        unavailableDays: parseAvailableDays(profile.unavail_days || ""),
        contractType: profile.contract_type,
        employmentStatus: user?.status ? "Active" : "Inactive",
        specializations,
        canTeachSubjects: qualifications,
        yearsOfExperience: 8, // placeholder
        lastAssignmentDate: lastAssignmentDate || new Date().toISOString(),
        current_load: currentLoad,
      };
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
      .select(
        `
        current_load,
        position_id,
        positions!inner (
          min_load
        )
      `
      )
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
        message: `Cannot assign subject. Adding ${units} units will exceed the allowed load (${
          min_load + 12
        }).`,
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
        total_duration,
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
    // First, get the schedule entry to retrieve teacher_id and subject_id
    const { data: scheduleData, error: scheduleError } = await supabase
      .from("teacher_schedules")
      .select("teacher_id, subject_id")
      .eq("id", id)
      .single();

    if (scheduleError) throw scheduleError;
    if (!scheduleData) {
      return res.status(404).json({
        title: "Failed",
        message: "Schedule entry not found.",
      });
    }

    const { teacher_id, subject_id } = scheduleData;

    // Get subject units separately
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

    const { units } = subjectData;

    // Get teacher's current load
    const { data: teacherData, error: teacherError } = await supabase
      .from("teacher_profile")
      .select("current_load")
      .eq("id", teacher_id)
      .single();

    if (teacherError) throw teacherError;
    if (!teacherData) {
      return res.status(404).json({
        title: "Failed",
        message: "Teacher not found.",
      });
    }

    const { current_load } = teacherData;

    // Delete the schedule entry
    const { data, error } = await supabase
      .from("teacher_schedules")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    // Update teacher's current load by subtracting the subject units
    const newLoad = Math.max(0, current_load - units); // Ensure load doesn't go below 0
    await supabase
      .from("teacher_profile")
      .update({ current_load: newLoad })
      .eq("id", teacher_id);

    return res.status(200).json({
      title: "Success",
      message: "Subject removed successfully.",
      data: data,
    });
  } catch (error) {
    console.error("Error removing subject:", error.message);
    console.error("Full error:", error);

    return res.status(500).json({
      title: "Failed",
      message: `Error removing subject: ${error.message}`,
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

    // If teacher_id is being changed, we need to update loads
    if (updateFields.teacher_id) {
      // Get the current schedule entry to find the old teacher and subject units
      const { data: currentSchedule, error: currentError } = await supabase
        .from("teacher_schedules")
        .select("teacher_id, subject_id")
        .eq("id", id)
        .single();

      if (currentError) throw currentError;
      if (!currentSchedule) {
        return res.status(404).json({
          title: "Failed",
          message: "Schedule entry not found.",
        });
      }

      const oldTeacherId = currentSchedule.teacher_id;
      const newTeacherId = updateFields.teacher_id;
      const { subject_id } = currentSchedule;

      // Get subject units separately
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

      const { units } = subjectData;

      // Only update loads if teacher is actually changing
      if (oldTeacherId !== newTeacherId) {
        // Get both teachers' current loads
        const { data: teachersData, error: teachersError } = await supabase
          .from("teacher_profile")
          .select("id, current_load")
          .in("id", [oldTeacherId, newTeacherId]);

        if (teachersError) throw teachersError;

        const oldTeacher = teachersData.find((t) => t.id === oldTeacherId);
        const newTeacher = teachersData.find((t) => t.id === newTeacherId);

        if (!oldTeacher || !newTeacher) {
          return res.status(404).json({
            title: "Failed",
            message: "One or both teachers not found.",
          });
        }

        // Update the schedule entry
        const { data, error } = await supabase
          .from("teacher_schedules")
          .update(updateFields)
          .eq("id", id)
          .select();

        if (error) throw error;

        // Update old teacher's load (subtract units)
        const oldTeacherNewLoad = Math.max(0, oldTeacher.current_load - units);
        await supabase
          .from("teacher_profile")
          .update({ current_load: oldTeacherNewLoad })
          .eq("id", oldTeacherId);

        // Update new teacher's load (add units)
        const newTeacherNewLoad = newTeacher.current_load + units;
        await supabase
          .from("teacher_profile")
          .update({ current_load: newTeacherNewLoad })
          .eq("id", newTeacherId);

        return res.status(200).json({
          title: "Success",
          message: "Subject reassigned successfully.",
          data: data[0],
        });
      }
    }

    // If teacher_id is not being changed, just update normally
    const { data, error } = await supabase
      .from("teacher_schedules")
      .update(updateFields)
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
    console.error("Full error:", error);

    return res.status(500).json({
      title: "Failed",
      message: `Error reassigning subject: ${error.message}`,
      data: null,
    });
  }
};

const getTeachers = async () => {
  const { data, error } = await supabase
    .from("teacher_profile")
    .select(
      `
      id,
      position_id,
      specializations,
      current_load,
      avail_days,
      pref_time,
      user_profile:teacher_profile_user_id_fkey (
        id,
        name,
        email,
        role
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
    `
    )
    .not("position_id", "is", null);

  if (error) {
    console.error("Error fetching teachers:", error.message);
    throw error;
  }

  return data;
};

const getRooms = async () => {
  const { data, error } = await supabase.from("room").select(`*`);

  if (error) {
    console.error("Error fetching rooms:", error.message);
    throw error;
  }

  return data;
};

const getSubjects = async () => {
  const { data, error } = await supabase.from("subjects").select(`*`);

  if (error) {
    console.error("Error fetching subjects:", error.message);
    throw error;
  }

  return data;
};

const getSections = async () => {
  const { data, error } = await supabase.from("sections").select(`
      *,
      student_sections:student_sections(count)
    `);

  if (error) {
    console.error("Error fetching sections:", error.message);
    throw error;
  }

  const sectionsWithCount = data.map((section) => ({
    ...section,
    total_count: section.student_sections[0]?.count || 0,
  }));

  return sectionsWithCount;
};

const runAutoSchedule = async (req, res) => {
  try {
    const { selectedFacultyIds } = req.body || {};

    // If selective scheduling, only reset schedules for selected faculty
    const response =
      selectedFacultyIds && selectedFacultyIds.length > 0
        ? await resetScheduleSelective(selectedFacultyIds)
        : await resetSchedule();

    if (!response) throw "Something went wrong";

    const [teachers, rooms, subjects, sections] = await Promise.all([
      getTeachers(),
      getRooms(),
      getSubjects(),
      getSections(),
    ]);

    // Get existing schedules to avoid conflicts with non-selected faculty
    const { data: existingSchedules, error: schedError } = await supabase.from(
      "teacher_schedules"
    ).select(`
        teacher_id,
        room_id,
        days,
        start_time,
        end_time,
        subject_id
      `);

    if (schedError) throw schedError;

    // Filter teachers if selective scheduling
    const filteredTeachers =
      selectedFacultyIds && selectedFacultyIds.length > 0
        ? teachers.filter((teacher) => selectedFacultyIds.includes(teacher.id))
        : teachers;

    // Get unassigned subjects (subjects not currently scheduled)
    const assignedSubjectIds = new Set(
      existingSchedules.map((s) => s.subject_id)
    );
    const unassignedSubjects = subjects.filter(
      (subject) => !assignedSubjectIds.has(subject.id)
    );

    const schedule = {};
    const loadMap = {};
    const dailySubjectCount = {};
    const roomBookings = {};
    const instructorBookings = {};
    const unassigned = [];
    const subjectTeacherMap = {};
    const sectionSubjectDays = {};

    // Initialize room bookings with existing schedules
    existingSchedules.forEach((sched) => {
      if (!roomBookings[sched.room_id]) roomBookings[sched.room_id] = {};
      if (!roomBookings[sched.room_id][sched.days])
        roomBookings[sched.room_id][sched.days] = [];
      roomBookings[sched.room_id][sched.days].push({
        start: sched.start_time,
        end: sched.end_time,
      });
    });

    // Initialize instructor bookings with existing schedules (for non-selected faculty)
    existingSchedules.forEach((sched) => {
      if (
        selectedFacultyIds &&
        selectedFacultyIds.length > 0 &&
        selectedFacultyIds.includes(sched.teacher_id)
      ) {
        return; // Skip selected faculty as their schedules were reset
      }
      if (!instructorBookings[sched.teacher_id])
        instructorBookings[sched.teacher_id] = {};
      if (!instructorBookings[sched.teacher_id][sched.days])
        instructorBookings[sched.teacher_id][sched.days] = [];
      instructorBookings[sched.teacher_id][sched.days].push({
        start: sched.start_time,
        end: sched.end_time,
      });
    });

    const instructors = filteredTeachers.map((teacher) => {
      const fullName = teacher.user_profile?.name || "No name";
      const maxLoad = teacher.positions?.min_load;
      const availDays = parseAvailableDays(teacher.avail_days);

      let timePref = { start: "08:00", end: "18:00" }; // default
      if (teacher.pref_time) {
        const [start, end] = teacher.pref_time.split("-").map((t) => t.trim());
        timePref = { start, end };
      }
      const specializations = teacher.specializations
        ? teacher.specializations
            .split(",")
            .map((s) => s.replace(/"/g, "").trim())
        : [];

      return {
        id: teacher.id,
        name: fullName,
        maxLoad,
        currentLoad: 0, // Reset to 0 since we cleared their schedules
        dayPref: availDays.length
          ? availDays
          : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        timePref,
        specializations,
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
      if (!instructorBookings[instructorId])
        instructorBookings[instructorId] = {};
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
      if (!instructorBookings[instructorId])
        instructorBookings[instructorId] = {};
      if (!instructorBookings[instructorId][day])
        instructorBookings[instructorId][day] = [];
      instructorBookings[instructorId][day].push({ start, end });
    };

    const getLecLabHours = (lecHours, labHours) => {
      const blocks = [];

      if (lecHours > 0) {
        if (lecHours <= 3) {
          // If lecture is 3 or less, make one block
          blocks.push({ type: "Lec", hours: lecHours });
        } else {
          let remaining = lecHours;
          while (remaining > 0) {
            const minBlock = Math.min(3, remaining);
            const maxBlock = remaining;
            const block = Math.max(minBlock, getRandomInt(minBlock, maxBlock));
            blocks.push({ type: "Lec", hours: block });
            remaining -= block;
          }
        }
      }

      if (labHours > 0) {
        if (labHours <= 3) {
          blocks.push({ type: "Lab", hours: labHours });
        } else {
          let remaining = labHours;
          while (remaining > 0) {
            const minBlock = Math.min(3, remaining);
            const maxBlock = remaining;
            const block = Math.max(minBlock, getRandomInt(minBlock, maxBlock));
            blocks.push({ type: "Lab", hours: block });
            remaining -= block;
          }
        }
      }

      return blocks;
    };

    const mapSubjectsToSections = (sections, subjects) => {
      const map = {};

      // Group sections by year-sem
      for (const section of sections) {
        const key = `${section.year.trim()}-${section.semester.trim()}`;
        if (!map[key]) {
          map[key] = { sections: [], subjects: [] };
        }
        map[key].sections.push(section);
      }

      // Group subjects by school_year-sem
      for (const subject of subjects) {
        const key = `${subject.school_year.trim()}-${subject.semester.trim()}`;
        if (!map[key]) {
          map[key] = { sections: [], subjects: [] };
        }
        map[key].subjects.push(subject);
      }

      return map;
    };
    const subjectSectionMap = mapSubjectsToSections(sections, subjects);

    for (const [key, group] of Object.entries(subjectSectionMap)) {
      const { sections, subjects } = group;

      for (const section of sections) {
        if (!sectionSubjectDays[section.id]) {
          sectionSubjectDays[section.id] = {};
        }

        for (const subject of subjects) {
          if (!sectionSubjectDays[section.id][subject.subject_code]) {
            sectionSubjectDays[section.id][subject.subject_code] = new Set();
          }

          // --- Check if already assigned instructor ---
          let assignedInstructorId =
            subjectTeacherMap[section.id]?.[subject.subject_code];

          if (!assignedInstructorId) {
            // find suitable instructor
            let chosenInstructor = null;

            for (const instructor of instructors) {
              // Init schedule/map for instructor if not yet
              if (!schedule[instructor.name]) schedule[instructor.name] = [];
              if (!loadMap[instructor.name])
                loadMap[instructor.name] = instructor.currentLoad;
              if (!dailySubjectCount[instructor.id])
                dailySubjectCount[instructor.id] = {};
              if (!instructorBookings[instructor.id])
                instructorBookings[instructor.id] = {};

              // set default days
              for (const day of instructor.dayPref) {
                if (dailySubjectCount[instructor.id][day] == null)
                  dailySubjectCount[instructor.id][day] = 0;
                if (!instructorBookings[instructor.id][day])
                  instructorBookings[instructor.id][day] = [];
              }

              // 1. Check load
              if (
                loadMap[instructor.name] + subject.units >
                instructor.maxLoad
              ) {
                continue;
              }

              // 2. Check specialization
              if (
                !instructor.specializations.includes(subject.specialization)
              ) {
                continue;
              }

              // ✅ Found a suitable instructor
              chosenInstructor = instructor;
              break;
            }

            if (!chosenInstructor) {
              unassigned.push({
                subject,
                section,
                reason: "No available instructor for subject",
              });
              continue;
            }

            // lock assignment
            if (!subjectTeacherMap[section.id])
              subjectTeacherMap[section.id] = {};
            subjectTeacherMap[section.id][subject.subject_code] =
              chosenInstructor.id;
            assignedInstructorId = chosenInstructor.id;
          }

          // Now we have an assigned instructor
          const instructor = instructors.find(
            (i) => i.id === assignedInstructorId
          );

          const timeBlocks = getLecLabHours(
            subject.lec_hours,
            subject.lab_hours
          );

          let allBlocksAssigned = true;
          let failReason = null;

          for (const blockHours of timeBlocks) {
            let blockAssigned = false;

            if (
              loadMap[instructor.name] + blockHours.hours >
              instructor.maxLoad
            ) {
              failReason = `Instructor ${instructor.name} exceeds max load with ${blockHours.hours}h`;
              allBlocksAssigned = false;
              break;
            }

            for (const day of instructor.dayPref) {
              if (
                sectionSubjectDays[section.id][subject.subject_code].has(day)
              ) {
                failReason = `Section ${section.name} already has ${subject.subject_code} on ${day}`;
                continue;
              }

              const prefStartMin = toMinutes(instructor.timePref.start);
              const prefEndMin = toMinutes(instructor.timePref.end);
              const durationMin = blockHours.hours * 60;

              const earliestStart = prefStartMin;
              const latestStart = prefEndMin - durationMin;
              if (latestStart < earliestStart) {
                failReason = `Time window too small for ${blockHours.hours}h on ${day}`;
                continue;
              }

              const randomStartMin = roundToSlot(earliestStart, 60);
              // const randomStartMin = getRandomInt(earliestStart, latestStart);
              const randomEndMin = randomStartMin + durationMin;
              const startTime = toHHMM(randomStartMin);
              const endTime = toHHMM(randomEndMin);

              const availableRoom = rooms.find(
                (room) =>
                  room.type.trim().toLowerCase() ===
                    blockHours.type.trim().toLowerCase() &&
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
                  units: blockHours.hours,
                });

                loadMap[instructor.name] += blockHours.hours;
                dailySubjectCount[instructor.id][day]++;
                bookRoom(availableRoom.id, day, startTime, endTime);
                bookInstructor(instructor.id, day, startTime, endTime);
                sectionSubjectDays[section.id][subject.subject_code].add(day);

                blockAssigned = true;
                failReason = null;
                break;
              } else {
                failReason = `No available room for ${subject.subject_code} on ${day} (${blockHours.type})`;
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
              section,
              reason: failReason,
            });
          }
        }
      }
    }

    // Group schedules for database insertion
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

    // Only update loads for selected faculty
    const updatePromises = Object.entries(loadMap).map(
      async ([teacherName, load]) => {
        const teacher = instructors.find((t) => t.name === teacherName);
        if (!teacher) return null;

        return supabase
          .from("teacher_profile")
          .update({ current_load: load })
          .eq("id", teacher.id);
      }
    );

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

const resetSchedule = async () => {
  await supabase.from("teacher_schedules").delete().neq("id", 0);

  await supabase
    .from("teacher_profile")
    .update({ current_load: 0 })
    .not("position_id", "is", null);

  return 1;
};

const resetScheduleSelective = async (selectedFacultyIds) => {
  // Delete schedules only for selected faculty
  await supabase
    .from("teacher_schedules")
    .delete()
    .in("teacher_id", selectedFacultyIds);

  // Reset current_load only for selected faculty
  await supabase
    .from("teacher_profile")
    .update({ current_load: 0 })
    .in("id", selectedFacultyIds);

  return 1;
};

const getConflicts = async (req, res) => {
  try {
    const { data: schedules, error } = await supabase.from("teacher_schedules")
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

const checkTeachersAvailability = async (req, res) => {
  try {
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
        ),
        positions:user_roles_position_id_fkey (
          position
        ),
        departments:user_roles_department_id_fkey (
          name
        )
      `
      )
      .not("position_id", "is", null); // exclude teachers without position_id

    if (error) throw error;

    // Filter teachers with no availability settings
    const teachersWithoutAvailability = data.filter((teacher) => {
      const hasAvailDays =
        teacher.avail_days && teacher.avail_days.trim() !== "";
      const hasPrefTime = teacher.pref_time && teacher.pref_time.trim() !== "";

      // Consider a teacher as having no availability if they lack both avail_days and pref_time
      return !hasAvailDays && !hasPrefTime;
    });

    const formattedTeachers = teachersWithoutAvailability.map((teacher) => ({
      id: teacher.id,
      employeeId: teacher.user_profile?.user_id || "",
      name: teacher.user_profile?.name || "Unnamed",
      email: teacher.user_profile?.email || "",
      department: teacher.departments?.name || "No Department",
      position: teacher.positions?.position || "No Position",
      availDays: teacher.avail_days || "",
      unavailDays: teacher.unavail_days || "",
      prefTime: teacher.pref_time || "",
      hasAvailability: false,
    }));

    return res.status(200).json({
      title: "Success",
      message: "Teachers availability check completed.",
      data: {
        teachersWithoutAvailability: formattedTeachers,
        totalTeachers: data.length,
        teachersWithoutAvailabilityCount: formattedTeachers.length,
        hasIssues: formattedTeachers.length > 0,
      },
    });
  } catch (error) {
    console.error("Error checking teachers availability:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const sectionSchedule = async (req, res) => {
  try {
    const { data: rows, error } = await supabase.from("teacher_schedules")
      .select(`
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
      `);

    if (error) throw error;

    // Group schedules by section
    const scheduleBySection = {};

    rows.forEach((row) => {
      const sectionName = row.sections?.name || "Unknown Section";
      if (!scheduleBySection[sectionName]) {
        scheduleBySection[sectionName] = [];
      }

      // Map abbreviated days back to full names
      const dayMap = {
        M: "Monday",
        T: "Tuesday",
        W: "Wednesday",
        Th: "Thursday",
        F: "Friday",
      };
      const daysExpanded =
        row.days.match(/Th|[MTWF]/g)?.map((d) => dayMap[d]) || [];

      daysExpanded.forEach((day) => {
        scheduleBySection[sectionName].push({
          subject: row.subjects?.subject,
          subject_code: row.subjects?.subject_code,
          specialization: row.subjects?.specialization,
          teacher: row.teacher_profile?.user_profile?.name,
          teacher_id: row.teacher_profile?.id,
          section_id: row.sections?.id,
          section: row.sections?.name,
          year: row.sections?.year,
          semester: row.sections?.semester,
          day,
          start: row.start_time,
          end: row.end_time,
          room_title: row.rooms?.room_title,
          room_id: row.rooms?.room_id,
          room_type: row.rooms?.type,
          units: row.total_duration,
        });
      });
    });

    return res.status(200).json({
      title: "Success",
      message: "Schedules fetched by section",
      data: scheduleBySection,
    });
  } catch (error) {
    console.error("Error fetching section schedules:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      error: error.message,
    });
  }
};

// Helper function to abbreviate days
const abbreviateDays = (days) => {
  const dayMap = {
    Monday: "M",
    Tuesday: "T",
    Wednesday: "W",
    Thursday: "Th",
    Friday: "F",
    Saturday: "S",
    Sunday: "Su",
  };

  return days
    .split(",")
    .map((day) => dayMap[day.trim()] || day.trim())
    .join("");
};

module.exports = {
  getLoad,
  addSubject,
  removeSubject,
  reassignSubject,
  runAutoSchedule,
  getConflicts,
  updateConflict,
  checkTeachersAvailability,
  sectionSchedule,
};

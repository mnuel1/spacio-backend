const supabase = require("../../supabase");
const getLoadQuery = require("../queries/coordinator").getLoadQuery;
const {
  parseAvailableDays,
  toMinutes,
  overlap
} = require('../utils.js');

const getLoad = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .select(getLoadQuery);

    if (error) throw error;

    const grouped = {};

    for (const sched of data) {
      const profile = sched.teacher_profile;
      const user = profile.user_profile;
      const teacherId = user.id;

      if (!grouped[teacherId]) {
        const specializations = profile.specializations
          ? profile.specializations.replace(/(^"|"$)/g, '').split('", "')
          : [];

        const qualifications = profile.qualifications
          ? profile.qualifications.split(',').map(q => q.trim())
          : [];

        const maxLoad = profile.positions?.max_load || 0;

        grouped[teacherId] = {
          id: teacherId,
          employeeId: user.user_id,
          firstName: user.name?.split(' ')[0] || '',
          lastName: user.name?.split(' ')[1] || '',
          middleName: '', // Optional field
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
          preferredDays: parseAvailableDays(profile.avail_days || ''),
          preferredTimeSlots: profile.pref_time ? [profile.pref_time] : [],
          unavailableDays: parseAvailableDays(profile.unavail_days || ''),
          contractType: profile.contract_type,
          employmentStatus: user.status ? 'Active' : 'Inactive',
          specializations,
          canTeachSubjects: qualifications,
          yearsOfExperience: 8, // placeholder
          lastAssignmentDate: sched.start_time,
        };
      }

      const hours = parseInt(sched.total_duration?.split(':')[0]) || 0;

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
        scheduleTime: `${sched.days} ${sched.start_time.slice(0, 5)}-${sched.end_time.slice(0, 5)}`,
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

      let loadStatus = 'Normal';
      if (fac.totalUnits > maxLoad) {
        loadStatus = 'Overloaded';
      } else if (fac.totalUnits < maxLoad) {
        loadStatus = 'Underloaded';
      }
      fac.loadStatus = loadStatus;
      fac.availableUnits = fac.maxLoad - fac.totalUnits;
      fac.utilizationPercentage = parseFloat(((fac.totalUnits / fac.maxLoad) * 100).toFixed(1));
      return fac;
    });

    return res.status(200).json({
      title: 'Success',
      message: 'Load retrieved successfully.',
      data: result,
    });
  } catch (error) {
    console.error('Error retrieving load:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null,
    });
  }
};

const addSubject = async (req, res) => {
  try {
    const { subject_id, teacher_id, section_id, room_id, days, start_time, end_time, total_copunt, semester, school_year } = req.body;

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
      message: 'Subject added successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error adding subject:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const removeSubject = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('teacher_schedules')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Subject removed successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error removing subject:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const reassignSubject = async (req, res) => {
  const { id } = req.params;
  const { subject_id, teacher_id, section_id, room_id, days, start_time, end_time, total_copunt, semester, school_year } = req.body;

  try {
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

    return res.status(200).json({
      title: 'Success',
      message: 'Subject reassigned successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error reassigning subject:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

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


const runAutoSchedule = async (req, res) => {
  
  const schedule = {};
  const loadMap = {};
  const roomBookings = {}; // { "Monday": [ { start, end, room } ] }
  const unassigned = [];
  const conflictNarratives = [];
  let totalExcess = 0;

  const getSortedInstructors = () => {
    return [...instructors].sort((a, b) => {
      const loadA = loadMap[a.name] || 0;
      const loadB = loadMap[b.name] || 0;
      return loadA - loadB;
    });
  };

  const isRoomAvailable = (room, day, start, end) => {
    const bookings = roomBookings[day] || [];
    return !bookings.some(b => b.room === room && overlap(b, { start, end }));
  };

  for (const subject of subjects) {
    let assigned = false;
    const { day, start, end, section } = subject.schedule;

    for (const instructor of getSortedInstructors()) {
      const { name, maxLoad, timePref, dayPref } = instructor;

      // 1. Day preference
      if (!dayPref.includes(day)) {
        conflictNarratives.push(`${name} is unavailable on ${day} for ${subject.name} Section ${section}.`);
        continue;
      }

      // 2. Time preference
      if (start < timePref.start || end > timePref.end) {
        conflictNarratives.push(`${name} is unavailable at ${start}-${end} on ${day} for ${subject.name} Section ${section}.`);
        continue;
      }

      // 3. Time overlap with existing schedule
      const currentSchedule = schedule[name] || [];
      if (currentSchedule.some(
        cls => cls.day === day && overlap(cls, subject.schedule))) {
        conflictNarratives.push(`${name} has a schedule conflict on ${day} for ${subject.name} Section ${section}.`);
        continue;
      }

      // 4. Max load check
      const currentLoad = loadMap[name] || 0;
      const potentialLoad = currentLoad + subject.load;
      if (potentialLoad > maxLoad) {
        conflictNarratives.push(`${name} cannot take ${subject.name} Section ${section} due to max load (${potentialLoad}/${maxLoad}).`);
        continue;
      }

      // 5. Room availability
      let roomAssigned = null;
      for (const room of rooms) {
        if (isRoomAvailable(room, day, start, end)) {
          roomAssigned = room;
          break;
        }
      }

      if (!roomAssigned) {
        conflictNarratives.push(`No available room for ${subject.name} Section ${section} on ${day} at ${start}-${end}.`);
        continue;
      }

      // All checks passed, assign class
      schedule[name] = [...currentSchedule, {
        ...subject.schedule,
        subject: subject.name,
        room: roomAssigned
      }];
      loadMap[name] = potentialLoad;
      roomBookings[day] = [...(roomBookings[day] || []), { start, end, room: roomAssigned }];
      assigned = true;
      break;
    }

    if (!assigned) {
      unassigned.push(`${subject.name} (Section ${section})`);
      conflictNarratives.push(`Could not assign ${subject.name} Section ${section} on ${day}.`);
    }
  }

  // Conflict Analysis and Tagging
  const conflictAnalysis = conflictNarratives.map(narrative => {
    let tag = 'Other';
    let title = 'Scheduling Issue';
    let severity = 'Low';
    let affected = 1;

    if (narrative.includes('has a schedule conflict')) {
      tag = 'Time Conflict';
      title = 'Instructor Time Overlap';
      severity = 'High';
    } else if (narrative.includes('unavailable on')) {
      tag = 'Day Conflict';
      title = 'Unavailable on Assigned Day';
      severity = 'Medium';
    } else if (narrative.includes('unavailable at')) {
      tag = 'Time Preference Conflict';
      title = 'Outside Preferred Time';
      severity = 'Medium';
    } else if (narrative.includes('due to max load')) {
      tag = 'Overload Conflict';
      title = 'Exceeds Max Load';
      severity = 'High';
    } else if (narrative.includes('No available room')) {
      tag = 'Room Conflict';
      title = 'No Room Available';
      severity = 'High';
    } else if (narrative.includes('Could not assign')) {
      tag = 'Unassigned';
      title = 'Subject Unassigned';
      severity = 'High';
    }

    return {
      tag,
      title,
      description: narrative,
      severity,
      affectedSchedules: affected
    };
  });

  return res.status(200).json({
    title: 'Success',
    message: 'Load retrieved successfully.',
    data: {
      schedule,
      loadMap,
      totalExcess,
      unassigned,
      roomBookings,
      conflictNarratives,
      diagnostics: conflictAnalysis
    }
  });
}

const getConflicts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conflicts')
      .select("*");

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Conflicts retrieved successfully.',
      data: data
    });
  } catch (error) {
    console.error('Error retrieving conflicts:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const updateConflict = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { data, error } = await supabase
      .from('conflicts')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Conflict updated successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error updating conflict:', error.message);
    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

module.exports = {
  getLoad,
  addSubject,
  removeSubject,
  reassignSubject,
  runAutoSchedule,
  getConflicts,
  updateConflict
};
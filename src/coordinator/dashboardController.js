const supabase = require("../../supabase");
const getFacultyQuery = require("../queries/coordinator").getFacultyQuery
const getSchedulesQuery = require("../queries/coordinator").getSchedulesQuery

const formatTime = (time) => {
  return time.slice(0, 5);
};

const overview = async () => {
  const { data: conflicts, error } = await supabase
    .from('conflicts')
    .select('*');

  if (error) {
    throw error;
  }

  let highPriority = 0;
  let mediumPriority = 0;

  conflicts.forEach(conflict => {
    const severity = conflict.severity?.toLowerCase();
    if (severity === 'high') highPriority++;
    else if (severity === 'medium') mediumPriority++;
  });

  const totalConflicts = highPriority + mediumPriority;

  const unresolvedConflicts = {
    title: "Unresolved Conflicts",
    icon: "AlertTriangle",
    metric: totalConflicts.toString(),
    highPriority,
    mediumPriority,
    hasConflicts: totalConflicts > 0
  };

  const { data: users, error: userError } = await supabase
    .from('user_profile')
    .select('*');

  if (userError) {
    console.error('Error fetching users:', error);
    throw error;
  }

  const totalUsers = users.length;

  const activeUsers = users.filter(u => u.status === true).length;
  const pendingRegistrations = users.filter(u => u.status === false).length;

  const registrationRate = totalUsers > 0
    ? Math.round((activeUsers / totalUsers) * 100)
    : 0;

  return {
    unresolvedConflicts,
    userManagement: {
      title: "User Management",
      icon: "UserCheck", // Replace with actual icon component if needed
      metric: `${totalUsers}`,
      pendingRegistrations,
      activeUsers,
      registrationRate
    }
  };
}

const facultyOverview = async () => {
  const { data: faculty, error } = await supabase
    .from('user_profile')
    .select(getFacultyQuery)
    .eq('status', true);

  if (error) {
    throw error;
  }

  const withLoad = [];
  const noLoad = [];
  const departmentStatsMap = {};
  let overloadedFaculty = 0;

  faculty.forEach(f => {
    const departmentName = f.teacher_profile[0]?.departments?.name || 'Others';
    const position = f.teacher_profile[0]?.positions?.position || '';
    const currentLoad = f.teacher_profile[0]?.current_load || 0;
    const schedules = f.teacher_profile[0]?.teacher_schedules || [];

    // Count department stats
    if (!departmentStatsMap[departmentName]) {
      departmentStatsMap[departmentName] = { name: departmentName, faculty: 0, activeLoad: 0 };
    }
    departmentStatsMap[departmentName].faculty++;

    if (schedules.length > 0) {
      departmentStatsMap[departmentName].activeLoad++;

      // Calculate total hours
      let totalHours = 0;
      schedules.forEach(sch => {
        if (sch.subjects?.total_hours) {
          totalHours += sch.subjects.total_hours;
        }
      });

      const maxLoad = f.teacher_profile.positions?.max_load || 18;
      const status = totalHours >= maxLoad ? 'full' : 'partial';

      if (status === 'full' && totalHours > maxLoad) {
        overloadedFaculty++;
      }

      withLoad.push({
        id: f.id,
        name: f.name,
        email: f.email,
        phone: f.phone,
        department: departmentName,
        position,
        status: f.status,
        contractType: f.teacher_profile.contract_type,
        currentLoad,
        subjects: schedules.map(sch => ({
          id: sch.subjects?.id,
          subjectCode: sch.subjects?.subject_code,
          subject: sch.subjects?.subject,
          totalHours: sch.subjects?.total_hours,
          units: sch.subjects?.units,
          semester: sch.subjects?.semester,
          schoolYear: sch.subjects?.school_year
        })),
        loadSummary: {
          subjectsCount: schedules.length,
          hours: totalHours,
          status
        },
        specializations: f.teacher_profile.specializations || [],
        qualifications: f.teacher_profile.qualifications || [],
        educations: f.teacher_profile.teacher_educations || []
      });
    } else {
      noLoad.push({
        id: f.id,
        name: f.name,
        department: departmentName,
        status: f.status,
        reason: 'No assigned subjects'
      });
    }
  });

  const departmentStats = Object.values(departmentStatsMap);

  // Faculty Load Summary
  const assignedFaculty = withLoad.length;
  const totalFaculty = faculty.length;
  const loadPercentage = totalFaculty > 0 ? ((assignedFaculty / totalFaculty) * 100).toFixed(0) + '%' : '0%';

  const facultyLoad = {
    title: "Faculty Load",
    icon: "Users", // replace with actual Users icon if using a library
    metric: loadPercentage,
    assignedFaculty,
    totalFaculty,
    overloadedFaculty
  };

  const response = {
    withLoad,
    noLoad,
    departmentStats,
    facultyLoad
  };

  return response;
};

const campusStatus = async () => {
  const { data: rooms, error } = await supabase
    .from('room')
    .select(`
        *,
        departments:room_department_id_fkey (
          name
        ),
        teacher_schedules:teacher_schedules_room_id_fkey (
          id,
          days,
          start_time,
          end_time,
          semester,
          subject_id,
          subjects:teacher_schedules_subject_id_fkey (
            subject
          ),
          teachers_profile:teacher_schedules_teacher_id_fkey (
            user_id,
            user_profile:teacher_profile_user_id_fkey (
              name
            )
          ),
          created_by,
          created_at,
          updated_at
        )
    `);

  if (error) {
    throw error;
  }

  const totalRooms = rooms.length;
  let occupied = 0;
  let available = 0;
  let maintenance = 0;

  const departmentMap = {};
  const floorMap = {};
  const currentOccupancy = [];

  rooms.forEach(room => {
    const status = room.status?.toLowerCase();

    if (status === 'occupied') {
      occupied++;
    } else if (status === 'active') {
      available++;
    } else if (status === 'maintenance') {
      maintenance++;
    }

    // Department Distribution
    const deptName = room.departments?.name || 'Unknown';
    if (!departmentMap[deptName]) {
      departmentMap[deptName] = { name: deptName, rooms: 0, occupied: 0, available: 0, maintenance: 0 };
    }
    departmentMap[deptName].rooms++;

    if (status === 'occupied') {
      departmentMap[deptName].occupied++;
    } else if (status === 'active') {
      departmentMap[deptName].available++;
    } else if (status === 'maintenance') {
      departmentMap[deptName].maintenance++;
    }

    // Floor Status
    const floor = room.floor || 0;
    if (!floorMap[floor]) {
      floorMap[floor] = { floor, total: 0, occupied: 0, available: 0, maintenance: 0 };
    }
    floorMap[floor].total++;

    if (status === 'occupied') {
      floorMap[floor].occupied++;
    } else if (status === 'active') {
      floorMap[floor].available++;
    } else if (status === 'maintenance') {
      floorMap[floor].maintenance++;
    }

    // Current Occupancy (rooms with schedules)
    if (room.teacher_schedules && room.teacher_schedules.length > 0) {
      room.teacher_schedules.forEach(schedule => {
        currentOccupancy.push({
          roomId: room.id,
          roomTitle: room.title,
          subject: schedule.subjects?.subject || '',
          professor: schedule.teachers_profile?.user_profile?.name || '',
          timeSlot: `${schedule.start_time} - ${schedule.end_time}`,
          department: deptName
        });
      });
    }
  });

  const departmentDistribution = Object.values(departmentMap);
  const floorStatus = Object.values(floorMap);

  // Calculate room utilization
  const utilizationPercentage = totalRooms > 0 ? ((occupied / totalRooms) * 100).toFixed(0) : 0;

  const roomUtilization = {
    title: "Room Utilization",
    icon: "Building", // Replace with actual Building icon component if using React
    metric: `${utilizationPercentage}%`,
    totalRooms,
    availableRooms: available,
    progress: Number(utilizationPercentage)
  };

  const response = {
    totalRooms,
    roomStatus: {
      occupied,
      available,
      maintenance
    },
    departmentDistribution,
    floorStatus,
    currentOccupancy,
    roomUtilization
  };

  return response;
};

const facultySchedule = async () => {
  const { data, error } = await supabase
    .from('teacher_schedules')
    .select(getSchedulesQuery);

  if (error) {
    console.error('Error fetching schedules:', error);
    throw error;
  }

  const facultyMap = new Map();

  data.forEach((schedule) => {
    const teacher = schedule.teacher_profile;
    if (teacher && teacher.user_profile) {
      facultyMap.set(teacher.id, {
        id: teacher.id,
        name: teacher.user_profile.name,
        department: teacher.departments?.name || 'Unknown',
      });
    }
  });

  const timeSlots = [
    '8:00', '9:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  const schedules = {};

  data.forEach((schedule) => {
    const teacherId = schedule.teacher_profile?.id;
    if (!teacherId) return;

    if (!schedules[teacherId]) {
      schedules[teacherId] = [];
    }

    schedules[teacherId].push({
      subject: schedule.subjects?.subject || 'Unknown',
      startTime: formatTime(schedule.start_time),
      endTime: formatTime(schedule.end_time),
      room: schedule.room?.room_title || 'TBD',
      students: schedule.total_count || 0,
      type: 'lecture',
      color: 'bg-blue-500',
    });
  });

  return {
    faculty: Array.from(facultyMap.values()),
    timeSlots,
    schedules,
  };

}

const getDashboard = async (req, res) => {
  try {

    const [
      facultyOverviewData, 
      campusStatusData, 
      facultyScheduleData,
      overviewData,
    ] = await Promise.all([
      facultyOverview(),
      campusStatus(),
      facultySchedule(),
      overview()
    ]);

    const response = {
      facultySched: facultyScheduleData,
      facultyOverview: facultyOverviewData,
      campusStatus: campusStatusData,
      overview: overviewData
    };


    return res.status(200).json({
      title: 'Success',
      message: 'Dashboard data retrieved successfully',
      data: response
    });

  } catch (error) {
    console.error('Error retrieving dashboard data:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};

module.exports = { getDashboard };
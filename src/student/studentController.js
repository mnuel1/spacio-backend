const supabase = require("../supabase.js");

const parseAvailableDays = require("../utils.js").parseAvailableDays;
const {
  getFacultyQuery,
  getSchedulesQuery,
} = require("../queries/coordinator.js");

const transformSchedule = (rawData) => {
  const studentSubjects = [];
  const roomsSet = new Set();
  const weeklySchedule = [];

  const subjectIndexMap = new Map(); // For mapping subject_code to index

  rawData.forEach(({ sections }) => {
    if (!sections || !sections.teacher_schedules) return;

    sections.teacher_schedules.forEach((schedule) => {
      const {
        start_time,
        end_time,
        days,
        room,
        subjects,
        teacher_profile,
      } = schedule;

      const subjectCode = subjects?.subject_code;
      if (!subjectCode || !subjects || !teacher_profile?.user_profile)
        return;

      // Add subject if not already added
      if (!subjectIndexMap.has(subjectCode)) {
        const subjectData = {
          code: subjectCode,
          name: subjects.subject,
          instructor: teacher_profile.user_profile.name,
          credits: subjects.units,
          type: subjects.subject_type, // "lecture", "lab", "seminar"
          description: subjects.description || "",
        };

        subjectIndexMap.set(subjectCode, studentSubjects.length);
        studentSubjects.push(subjectData);
      }

      // Add room
      if (room?.room_title) {
        roomsSet.add(room.room_title);
      }

      // Compute time-based data
      const subjectIdx = subjectIndexMap.get(subjectCode);

      const startHour = parseInt(start_time.split(":")[0]);
      const endHour = parseInt(end_time.split(":")[0]);
      const startMin = parseInt(start_time.split(":")[1]);
      const duration =
        endHour +
        parseInt(end_time.split(":")[1]) / 60 -
        (startHour + startMin / 60);

      // Map each letter in days string (e.g., MWF)
      const dayMap = {
        M: 0,
        T: 1,
        W: 2,
        R: 3,
        F: 4,
        S: 5,
      };

      for (const char of days) {
        const day = dayMap[char];
        if (day !== undefined) {
          weeklySchedule.push({
            day,
            subject: subjectIdx,
            startHour: startHour + startMin / 60,
            duration: parseFloat(duration.toFixed(1)),
            section: sections.name || "A",
          });
        }
      }
    });
  });

  return {
    studentSubjects,
    rooms: Array.from(roomsSet),
    weeklySchedule,
  };
};

const getSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("student_sections")
      .select(
        `
        sections:student_sections_section_id_fkey(
          teacher_schedules:teacher_schedules_section_id_fkey(
            ${getSchedulesQuery}
          )
        )  
      `
      )
      .eq("student_id", id);

    if (error) throw error;


    const transformed = transformSchedule(data);

    return res.status(200).json({
      title: "Success",
      message: "Faculty retrieved successfully.",
      data: transformed,
    });
  } catch (error) {
    console.error("Error retrieving faculty:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getFaculty = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select(getFacultyQuery)
      .eq("status", true);

    if (error) throw error;

    const formatted = data.map((user) => {
      const profile = user.teacher_profile?.[0] || {};
      const position = profile.positions || {};
      const department = profile.departments || {};

      const certifications = profile.certifications
        ? profile.certifications.replace(/(^"|"$)/g, "").split('","')
        : [];
      const specializations = profile.specializations
        ? profile.specializations.replace(/(^"|"$)/g, "").split('","')
        : [];

      return {
        id: user.id,
        employeeId: user.user_id,
        firstName: user.name?.split(" ")[0] || "",
        lastName: user.name?.split(" ")[1] || "",
        middleName: "",
        email: user.email,
        phoneNumber: user.phone,
        department: department.name || null,
        position: position.position || null,
        employmentStatus: user.status ? "Active" : "Inactive",
        loadStatus:
          profile.current_load >= position.min_load ? "Normal" : "Underload",
        dateHired: user.created_at,
        dateOfBirth: user.birthdate,
        gender: user.gender,
        civilStatus: user.civil_status,
        address: user.address
          ? {
            street: user.address?.street || "",
            city: user.address?.city || "",
            province: user.address?.province || "",
            zipCode: user.address?.zip_code || "",
          }
          : null,
        emergencyContact: {
          name: profile.em_contact_name || "",
          relationship: profile.em_contact_rs || "",
          phoneNumber: profile.em_contact_phone || "",
        },
        education: Array.isArray(profile.teacher_educations)
          ? profile.teacher_educations.map((ed) => ({
            degree: ed.degree,
            major: ed.area,
            university: ed.school,
            graduationYear: ed.year_grad,
          }))
          : [
            // Fallback if only one education object
            {
              degree: profile.teacher_educations?.degree,
              major: profile.teacher_educations?.area,
              university: profile.teacher_educations?.school,
              graduationYear: profile.teacher_educations?.year_grad,
            },
          ],
        certifications,
        specializations,
        currentLoad: profile.current_load,
        maxLoad: position.max_load,
        subjects:
          profile.teacher_schedules?.map((s) => ({
            id: s.subjects?.id,
            name: s.subjects?.subject,
            code: s.subjects?.subject_code,
            units: s.subjects?.units,
            hours: s.subjects?.total_hours,
            semester: s.subjects?.semester,
            academicYear: s.subjects?.school_year,
          })) || [],
        profileImage: user.profile_image,
        isActive: user.status,
        preferredSchedule: {
          availableDays: parseAvailableDays(profile.avail_days),
          preferredTimeSlots: profile.pref_time ? [profile.pref_time] : [],
        },
        salaryGrade: profile.salary_grade,
        contractType: profile.contract_type,
      };
    });

    return res.status(200).json({
      title: "Success",
      message: "Faculty retrieved successfully.",
      data: formatted,
    });
  } catch (error) {
    console.error("Error retrieving faculty:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};


const getDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const currentDayMap = ["M", "T", "W", "R", "F", "S"];
    const todayChar = currentDayMap[new Date().getDay() - 1]; // Monday=0 index
    const now = new Date();
    const nowHours = now.getHours() + now.getMinutes() / 60;

    // --- 1. Get Schedule Data ---
    const { data: scheduleData, error: scheduleError } = await supabase
      .from("student_sections")
      .select(
        `
        sections:student_sections_section_id_fkey(
          teacher_schedules:teacher_schedules_section_id_fkey(
            ${getSchedulesQuery}
          )
        )
      `
      )
      .eq("student_id", id);

    if (scheduleError) throw scheduleError;

    const transformedSchedule = transformSchedule(scheduleData);

    const totalClasses = transformedSchedule.weeklySchedule.length;
    const totalHours = transformedSchedule.weeklySchedule.reduce(
      (sum, c) => sum + c.duration,
      0
    );
    const subjectsCount = transformedSchedule.studentSubjects.length;
    const totalUnits = transformedSchedule.studentSubjects.reduce(
      (sum, subj) => sum + (subj.credits || 0),
      0
    );

    const todaysClassesList = transformedSchedule.weeklySchedule.filter(
      (c) => currentDayMap[c.day] === todayChar
    );

    const completedToday = todaysClassesList.filter(
      (c) => c.startHour + c.duration <= nowHours
    ).length;

    const remainingToday = todaysClassesList.length - completedToday;

    const nextClassToday = todaysClassesList
      .filter((c) => c.startHour > nowHours)
      .sort((a, b) => a.startHour - b.startHour)[0];

    let nextClassDetails = null;
    if (nextClassToday) {
      const subj = transformedSchedule.studentSubjects[nextClassToday.subject];
      nextClassDetails = {
        subjectCode: subj.code,
        subjectName: subj.name,
        instructor: subj.instructor,
        room: transformedSchedule.rooms[0] || "TBA",
        startTime: `${Math.floor(nextClassToday.startHour)
          .toString()
          .padStart(2, "0")}:${Math.round(
          (nextClassToday.startHour % 1) * 60
        )
          .toString()
          .padStart(2, "0")}`,
        endTime: `${Math.floor(
          nextClassToday.startHour + nextClassToday.duration
        )
          .toString()
          .padStart(2, "0")}:${Math.round(
          ((nextClassToday.startHour + nextClassToday.duration) % 1) * 60
        )
          .toString()
          .padStart(2, "0")}`,
        type: subj.type,
      };
    }

    // --- 2. Get Faculty Data ---
    const { data: facultyData, error: facultyError } = await supabase
      .from("user_profile")
      .select(getFacultyQuery)
      .eq("status", true);

    if (facultyError) throw facultyError;

    const formattedFaculty = facultyData.map((user) => {
      const profile = user.teacher_profile?.[0] || {};
      const department = profile.departments || {};
      return {
        id: user.id,
        name: user.name,
        department: department.name || null,
        subject:
          profile.teacher_schedules?.[0]?.subjects?.subject || "Unknown",
        contactEmail: user.email,
      };
    });

    const studentInstructorNames = new Set(
      transformedSchedule.studentSubjects.map((s) => s.instructor)
    );
    const myInstructors = formattedFaculty.filter((f) =>
      studentInstructorNames.has(f.name)
    );

    // --- 3. Combine into Dashboard Response ---
    const dashboardData = {
      scheduleOverview: {
        stats: {
          totalClasses,
          totalHours,
          subjects: subjectsCount,
          units: totalUnits,
          avgClassSize: null, // Replace if you have class size info
        },
        todaysClasses: {
          count: todaysClassesList.length,
          completed: completedToday,
          remaining: remainingToday,
        },
        nextClass: nextClassDetails,
      },
      facultySummary: {
        totalFaculty: formattedFaculty.length,
        departments: [
          ...new Set(formattedFaculty.map((f) => f.department).filter(Boolean)),
        ],
        myInstructors,
      },
    };

    return res.status(200).json({
      title: "Success",
      message: "Dashboard data retrieved successfully.",
      data: dashboardData,
    });
  } catch (error) {
    console.error("Error retrieving dashboard:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};


module.exports = {  
  getSchedule,
  getFaculty,
  getDashboard
};

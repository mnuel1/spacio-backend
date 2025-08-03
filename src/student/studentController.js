const supabase = require("../../supabase");

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

module.exports = {
  getSchedule,
  getFaculty,
};

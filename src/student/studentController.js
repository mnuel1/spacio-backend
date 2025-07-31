const supabase = require("../../supabase")

const parseAvailableDays = require('../utils.js').parseAvailableDays;
const getFacultyQuery = require('../queries/coordinator.js').getFacultyQuery;

const getSchedule = async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from()

    return res.status(200).json({
      title: 'Success',
      message: 'Faculty retrieved successfully.',
      data: formatted,
    });
  } catch (error) {
    console.error('Error retrieving faculty:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null,
    });
  }
}

const getFaculty = async (req, res) => {
  try {

    const { data, error } = await supabase
      .from('user_profile')
      .select(getFacultyQuery)
      .eq('status', true)

    if (error) throw error;

    const formatted = data.map((user) => {
      const profile = user.teacher_profile?.[0] || {};
      const position = profile.positions || {};
      const department = profile.departments || {};

      const certifications = profile.certifications ? profile.certifications.replace(/(^"|"$)/g, '').split('","') : [];
      const specializations = profile.specializations ? profile.specializations.replace(/(^"|"$)/g, '').split('","') : [];

      return {
        id: user.id,
        employeeId: user.user_id,
        firstName: user.name?.split(' ')[0] || '',
        lastName: user.name?.split(' ')[1] || '',
        middleName: '',
        email: user.email,
        phoneNumber: user.phone,
        department: department.name || null,
        position: position.position || null,
        employmentStatus: user.status ? 'Active' : 'Inactive',
        loadStatus: profile.current_load >= position.min_load ? 'Normal' : 'Underload',
        dateHired: user.created_at,
        dateOfBirth: user.birthdate,
        gender: user.gender,
        civilStatus: user.civil_status,
        address: user.address ? {
          street: user.address?.street || '',
          city: user.address?.city || '',
          province: user.address?.province || '',
          zipCode: user.address?.zip_code || '',
        } : null,
        emergencyContact: {
          name: profile.em_contact_name || '',
          relationship: profile.em_contact_rs || '',
          phoneNumber: profile.em_contact_phone || '',
        },
        education: Array.isArray(profile.teacher_educations)
          ? profile.teacher_educations.map((ed) => ({
            degree: ed.degree,
            major: ed.area,
            university: ed.school,
            graduationYear: ed.year_grad,
          }))
          : [ // Fallback if only one education object
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
        subjects: profile.teacher_schedules?.map((s) => ({
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
      title: 'Success',
      message: 'Faculty retrieved successfully.',
      data: formatted,
    });
  } catch (error) {
    console.error('Error retrieving faculty:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null,
    });
  }
}


module.exports = {
  getSchedule,
  getFaculty
}
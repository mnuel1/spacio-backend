const getFacultyQuery = require("../queries/coordinator.js").getFacultyQuery;
const supabase = require("../../supabase");
const parseAvailableDays = require("../utils.js").parseAvailableDays;

const combineFullName = (firstName, middleName, lastName) => {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
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

const createFaculty = async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      department_id,
      position_id,
    } = req.body;

    const fullName = combineFullName(firstName, middleName, lastName);

    // Generate default password (name in caps)
    const defaultPassword = fullName.toUpperCase().replace(/\s+/g, "");

    // Step 1: Create user authentication account
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: email,
        password: defaultPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: fullName,
          role: "Faculty",
        },
      });

    if (authError) throw authError;

    const authUserId = authData.user.id;

    // Step 2: Update the auto-created user profile with missing fields
    const { data: userData, error: userError } = await supabase
      .from("user_profile")
      .update({
        name: fullName,
        phone,
        status: true,
      })
      .eq("identity_id", authUserId)
      .select("id")
      .single();

    if (userError) throw userError;

    const userId = userData.id;

    // Step 3: Create teacher profile
    const { data: profileData, error: profileError } = await supabase
      .from("teacher_profile")
      .update({ department_id, position_id })
      .eq("user_id", userId);

    if (profileError) {
      // If teacher profile creation fails, cleanup auth user (which will cascade delete user profile via trigger)
      await supabase.auth.admin.deleteUser(authUserId);
      throw profileError;
    }

    return res.status(201).json({
      title: "Success",
      message: `Faculty created successfully. Default password: ${defaultPassword}`,
      data: {
        userId,
        authUserId,
        email,
        defaultPassword,
        profile: profileData,
      },
    });
  } catch (error) {
    console.error("Error creating faculty:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const updateFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      department_id,
      position_id,
    } = req.body;

    const fullName = combineFullName(firstName, middleName, lastName);

    // Update user profile
    const { error: userError } = await supabase
      .from("user_profile")
      .update({ name: fullName, email, phone })
      .eq("id", id);

    if (userError) throw userError;

    // Check if teacher profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("teacher_profile")
      .select("id")
      .eq("user_id", id);

    if (checkError) {
      console.error("Error checking existing profile:", checkError);
      throw checkError;
    }

    let profileUpdateData;

    if (existingProfile && existingProfile.length > 0) {
      // Update existing teacher profile
      console.log("Updating existing teacher profile with:", {
        department_id,
        position_id,
        user_id: id,
      });
      const { data, error: profileError } = await supabase
        .from("teacher_profile")
        .update({ department_id, position_id })
        .eq("user_id", id)
        .select();

      if (profileError) {
        console.error("Profile update error:", profileError);
        throw profileError;
      }
      profileUpdateData = data;
    } else {
      // Create new teacher profile
      console.log("Creating new teacher profile with:", {
        department_id,
        position_id,
        user_id: id,
      });
      const { data, error: profileError } = await supabase
        .from("teacher_profile")
        .insert({
          user_id: id,
          department_id,
          position_id,
          current_load: 0, // Default values
          avail_days: null,
          unavail_days: null,
          pref_time: null,
          qualifications: null,
          salary_grade: null,
          contract_type: null,
          specializations: null,
          certifications: null,
          em_contact_name: null,
          em_contact_rs: null,
          em_contact_phone: null,
          education_id: null,
        })
        .select();

      if (profileError) {
        console.error("Profile creation error:", profileError);
        throw profileError;
      }
      profileUpdateData = data;
    }

    console.log("Profile operation result:", profileUpdateData);

    // Fetch the updated faculty data with correct joins
    const { data: updatedFacultyData, error: fetchError } = await supabase
      .from("user_profile")
      .select(
        `
        id,
        user_id,
        name,
        email,
        phone,
        status,
        birthdate,
        gender,
        civil_status,
        address,
        profile_image,
        created_at,
        teacher_profile (
          salary_grade,
          contract_type,
          certifications,
          specializations,
          em_contact_name,
          em_contact_phone,
          em_contact_rs,
          current_load,
          avail_days,
          unavail_days,
          pref_time,
          qualifications,
          department_id,
          position_id,
          departments (
            name
          ),
          positions (
            position,
            max_load,
            min_load
          ),
          teacher_educations (
            degree,
            area,
            program,
            school,
            year_grad
          )
        )
      `
      )
      .eq("id", id);

    if (fetchError) throw fetchError;

    if (!updatedFacultyData || updatedFacultyData.length === 0) {
      throw new Error("Faculty member not found after update");
    }

    console.log(
      "Updated faculty data:",
      JSON.stringify(updatedFacultyData[0], null, 2)
    );

    // Format the response data (same formatting as getFaculty)
    const user = updatedFacultyData[0];
    const profile = user.teacher_profile?.[0] || {};
    const position = profile.positions || {};
    const department = profile.departments || {};

    console.log("Profile data:", profile);
    console.log("Position data:", position);
    console.log("Department data:", department);

    // Parse certifications and specializations (same as getFaculty)
    const certifications = profile.certifications
      ? profile.certifications.replace(/(^"|"$)/g, "").split('","')
      : [];
    const specializations = profile.specializations
      ? profile.specializations.replace(/(^"|"$)/g, "").split('","')
      : [];

    const formattedFaculty = {
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

    return res.status(200).json({
      title: "Success",
      message: "Faculty updated successfully.",
      data: formattedFaculty,
    });
  } catch (error) {
    console.error("Error updating faculty:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const deleteFaculty = async (req, res) => {
  try {
    const { id } = req.params;

    // First, get the user's identity_id from user_profile
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profile")
      .select("identity_id, name")
      .eq("id", id)
      .single();

    if (profileError) throw profileError;

    if (!userProfile || !userProfile.identity_id) {
      return res.status(404).json({
        title: "Failed",
        message: "Faculty not found or identity_id is missing.",
        data: null,
      });
    }

    console.log(
      "Attempting to delete user with identity_id:",
      userProfile.identity_id
    );

    // Manual cascade deletion approach (if trigger-based doesn't work)
    // Step 1: Delete teacher_profile first
    const { error: teacherError } = await supabase
      .from("teacher_profile")
      .delete()
      .eq("user_id", id);

    if (teacherError) {
      console.error("Error deleting teacher profile:", teacherError);
      // Continue anyway, as the teacher profile might not exist
    }

    // Step 2: Delete user_profile
    const { error: userProfileError } = await supabase
      .from("user_profile")
      .delete()
      .eq("id", id);

    if (userProfileError) {
      console.error("Error deleting user profile:", userProfileError);
      throw new Error(
        `User profile deletion failed: ${userProfileError.message}`
      );
    }

    // Step 3: Delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(
      userProfile.identity_id
    );

    if (authError) {
      console.error("Auth deletion error details:", {
        message: authError.message,
        status: authError.status,
        code: authError.code,
        details: authError,
      });
      // If auth deletion fails but database records are deleted, still consider it a success
      console.warn(
        "Auth user deletion failed, but database records were cleaned up"
      );
    }

    return res.status(200).json({
      title: "Success",
      message: `Faculty ${userProfile.name} deleted successfully.`,
      data: {
        deletedUserId: id,
        deletedIdentityId: userProfile.identity_id,
        authDeleted: !authError,
      },
    });
  } catch (error) {
    console.error("Error deleting faculty:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

const checkFacultyDataIntegrity = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select(
        `
        id,
        user_id,
        name,
        email,
        status,
        role,
        teacher_profile (
          id,
          department_id,
          position_id,
          departments (
            id,
            name
          ),
          positions (
            id,
            position,
            min_load,
            max_load
          )
        )
      `
      )
      .eq("status", true)
      .eq("role", "Faculty");

    if (error) throw error;

    const facultyWithIssues = [];
    const facultyStats = {
      total: data.length,
      withIssues: 0,
      missingPosition: 0,
      missingDepartment: 0,
      missingBoth: 0,
      noProfile: 0,
    };

    data.forEach((user) => {
      const profile = user.teacher_profile?.[0];
      const issues = [];

      // Check if faculty has no teacher profile at all
      if (!profile) {
        issues.push("No teacher profile");
        facultyStats.noProfile++;
      } else {
        // Check for missing department
        if (!profile.department_id || !profile.departments) {
          issues.push("Missing department");
          facultyStats.missingDepartment++;
        }

        // Check for missing position
        if (!profile.position_id || !profile.positions) {
          issues.push("Missing position");
          facultyStats.missingPosition++;
        }

        // Check if both are missing
        if (
          (!profile.department_id || !profile.departments) &&
          (!profile.position_id || !profile.positions)
        ) {
          facultyStats.missingBoth++;
        }
      }

      if (issues.length > 0) {
        facultyStats.withIssues++;
        facultyWithIssues.push({
          id: user.id,
          employeeId: user.user_id,
          name: user.name,
          email: user.email,
          issues,
          severity: issues.includes("No teacher profile")
            ? "critical"
            : issues.length >= 2
            ? "high"
            : "medium",
          currentDepartment: profile?.departments?.name || null,
          currentPosition: profile?.positions?.position || null,
        });
      }
    });

    return res.status(200).json({
      title: "Success",
      message: "Faculty data integrity check completed.",
      data: {
        facultyWithIssues,
        stats: facultyStats,
        hasIssues: facultyWithIssues.length > 0,
      },
    });
  } catch (error) {
    console.error("Error checking faculty data integrity:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  createFaculty,
  updateFaculty,
  deleteFaculty,
  getFaculty,
  checkFacultyDataIntegrity,
};

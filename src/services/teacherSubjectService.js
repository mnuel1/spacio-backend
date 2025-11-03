const supabase = require("../supabase.js");

/**
 * Get all subjects a teacher can teach
 * @param {number} teacherId - Teacher profile ID
 * @returns {Promise<Array>} Array of subject objects with proficiency
 */
const getTeacherSubjects = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select(
      `
      id,
      proficiency_level,
      subjects:subject_id (
        id,
        subject_code,
        subject,
        specialization,
        units,
        lec_hours,
        lab_hours,
        semester,
        school_year
      )
    `
    )
    .eq("teacher_id", teacherId);

  if (error) {
    console.error("Error fetching teacher subjects:", error);
    throw error;
  }

  return data.map((ts) => ({
    ...ts.subjects,
    proficiency_level: ts.proficiency_level,
  }));
};

/**
 * Get subject IDs a teacher can teach
 * @param {number} teacherId
 * @returns {Promise<Array<number>>} Array of subject IDs
 */
const getTeacherSubjectIds = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("subject_id")
    .eq("teacher_id", teacherId);

  if (error) {
    console.error("Error fetching teacher subject IDs:", error);
    throw error;
  }

  return data.map((ts) => ts.subject_id);
};

/**
 * Check if teacher can teach a specific subject
 * @param {number} teacherId
 * @param {number} subjectId
 * @returns {Promise<boolean>}
 */
const canTeacherTeachSubject = async (teacherId, subjectId) => {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (error) {
    console.error("Error checking teacher subject:", error);
    throw error;
  }

  return data !== null;
};

/**
 * Assign multiple subjects to a teacher
 * @param {number} teacherId
 * @param {Array<number>} subjectIds
 * @param {string} proficiencyLevel - 'expert', 'advanced', or 'competent'
 * @returns {Promise<Array>}
 */
const assignSubjectsToTeacher = async (
  teacherId,
  subjectIds,
  proficiencyLevel = "competent"
) => {
  const records = subjectIds.map((subjectId) => ({
    teacher_id: teacherId,
    subject_id: subjectId,
    proficiency_level: proficiencyLevel,
  }));

  const { data, error } = await supabase
    .from("teacher_subjects")
    .upsert(records, {
      onConflict: "teacher_id,subject_id",
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error("Error assigning subjects to teacher:", error);
    throw error;
  }

  return data;
};

/**
 * Remove a subject from a teacher
 * @param {number} teacherId
 * @param {number} subjectId
 */
const removeSubjectFromTeacher = async (teacherId, subjectId) => {
  const { error } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_id", subjectId);

  if (error) {
    console.error("Error removing subject from teacher:", error);
    throw error;
  }
};

/**
 * Clear all subjects for a teacher
 * @param {number} teacherId
 */
const clearTeacherSubjects = async (teacherId) => {
  const { error } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherId);

  if (error) {
    console.error("Error clearing teacher subjects:", error);
    throw error;
  }
};

/**
 * Get all teachers who can teach a specific subject
 * @param {number} subjectId
 * @returns {Promise<Array>}
 */
const getTeachersForSubject = async (subjectId) => {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select(
      `
      id,
      proficiency_level,
      teacher_profile:teacher_id (
        id,
        current_load,
        avail_days,
        pref_time,
        user_profile:teacher_profile_user_id_fkey (
          id,
          name,
          email,
          user_id
        ),
        positions:user_roles_position_id_fkey (
          id,
          position,
          max_load,
          min_load
        )
      )
    `
    )
    .eq("subject_id", subjectId);

  if (error) {
    console.error("Error fetching teachers for subject:", error);
    throw error;
  }

  return data.map((ts) => ({
    ...ts.teacher_profile,
    proficiency_level: ts.proficiency_level,
  }));
};

/**
 * LEGACY: Get subjects by specialization codes (for backward compatibility)
 * @param {Array<string>} specializationCodes
 * @returns {Promise<Array>}
 */
const getSubjectsBySpecialization = async (specializationCodes) => {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .in("specialization", specializationCodes);

  if (error) {
    console.error("Error fetching subjects by specialization:", error);
    throw error;
  }

  return data;
};

module.exports = {
  getTeacherSubjects,
  getTeacherSubjectIds,
  canTeacherTeachSubject,
  assignSubjectsToTeacher,
  removeSubjectFromTeacher,
  clearTeacherSubjects,
  getTeachersForSubject,
  getSubjectsBySpecialization,
};

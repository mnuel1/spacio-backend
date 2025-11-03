const {
  getTeacherSubjects,
  assignSubjectsToTeacher,
  removeSubjectFromTeacher,
  clearTeacherSubjects,
  getTeachersForSubject,
} = require("../services/teacherSubjectService.js");
const supabase = require("../supabase.js");

/**
 * GET /api/teachers/:teacherId/subjects
 * Get all subjects a teacher can teach
 */
const getTeacherSubjectsHandler = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const subjects = await getTeacherSubjects(teacherId);

    return res.status(200).json({
      title: "Success",
      message: "Teacher subjects retrieved successfully.",
      data: subjects,
    });
  } catch (error) {
    console.error("Error retrieving teacher subjects:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

/**
 * POST /api/teachers/:teacherId/subjects
 * Assign subjects to teacher
 * Body: { subject_ids: [1, 2, 3], proficiency_level: 'expert' }
 */
const assignTeacherSubjectsHandler = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { subject_ids, proficiency_level } = req.body;

    if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
      return res.status(400).json({
        title: "Failed",
        message: "subject_ids must be a non-empty array.",
        data: null,
      });
    }

    const validProficiencyLevels = ["expert", "advanced", "competent"];
    const level = proficiency_level || "competent";

    if (!validProficiencyLevels.includes(level)) {
      return res.status(400).json({
        title: "Failed",
        message: `proficiency_level must be one of: ${validProficiencyLevels.join(", ")}`,
        data: null,
      });
    }

    const assignments = await assignSubjectsToTeacher(
      teacherId,
      subject_ids,
      level
    );

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Assigned ${subject_ids.length} subjects to teacher ID ${teacherId}`,
      by: req.body.user_id ?? null,
    });

    return res.status(201).json({
      title: "Success",
      message: `Successfully assigned ${subject_ids.length} subjects to teacher.`,
      data: assignments,
    });
  } catch (error) {
    console.error("Error assigning subjects to teacher:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

/**
 * DELETE /api/teachers/:teacherId/subjects/:subjectId
 * Remove a subject from teacher
 */
const removeTeacherSubjectHandler = async (req, res) => {
  try {
    const { teacherId, subjectId } = req.params;

    await removeSubjectFromTeacher(teacherId, subjectId);

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Removed subject ID ${subjectId} from teacher ID ${teacherId}`,
      by: req.body.user_id ?? null,
    });

    return res.status(200).json({
      title: "Success",
      message: "Subject removed from teacher successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Error removing subject from teacher:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

/**
 * DELETE /api/teachers/:teacherId/subjects
 * Clear all subjects from teacher
 */
const clearTeacherSubjectsHandler = async (req, res) => {
  try {
    const { teacherId } = req.params;

    await clearTeacherSubjects(teacherId);

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Cleared all subjects from teacher ID ${teacherId}`,
      by: req.body.user_id ?? null,
    });

    return res.status(200).json({
      title: "Success",
      message: "All subjects cleared from teacher successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Error clearing teacher subjects:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

/**
 * GET /api/subjects/:subjectId/teachers
 * Get all teachers who can teach a specific subject
 */
const getTeachersForSubjectHandler = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const teachers = await getTeachersForSubject(subjectId);

    return res.status(200).json({
      title: "Success",
      message: "Teachers retrieved successfully.",
      data: teachers,
    });
  } catch (error) {
    console.error("Error retrieving teachers for subject:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getTeacherSubjectsHandler,
  assignTeacherSubjectsHandler,
  removeTeacherSubjectHandler,
  clearTeacherSubjectsHandler,
  getTeachersForSubjectHandler,
};

const supabase = require("../supabase.js");
const { getCurrentAcademicPeriod } = require("../utils.js");

/**
 * GET /api/coordinator/subjects
 * Get all subjects (optionally filtered by academic period)
 */
const getSubjects = async (req, res) => {
  try {
    const { academic_period_id } = req.query;

    let query = supabase.from("subjects").select("*");

    // If academic_period_id is provided, filter by it
    // Otherwise, get subjects for current academic period
    if (academic_period_id) {
      query = query.eq("academic_period_id", academic_period_id);
    } else {
      const currentPeriod = await getCurrentAcademicPeriod(supabase);
      if (currentPeriod?.id) {
        query = query.eq("academic_period_id", currentPeriod.id);
      }
    }

    query = query.order("school_year", { ascending: true }).order("semester", { ascending: true }).order("subject_code", { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Subjects retrieved successfully.",
      data: data || [],
    });
  } catch (error) {
    console.error("Error retrieving subjects:", error);
    return res.status(500).json({
      title: "Failed",
      message: error.message || "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getSubjects,
};

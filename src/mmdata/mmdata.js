const supabase = require("../../supabase");

const getDataMaster = async (req, res) => {
  try {
    const { data: subjects, error: subjectError } = await supabase
      .from("subjects")
      .select(
        "id, subject, subject_code, units, total_hours, semester, school_year"
      );
    if (subjectError) throw subjectError;

    const { data: rooms, error: roomError } = await supabase
      .from("room")
      .select("id, room_id, room_title, room_desc, status, floor");
    if (roomError) throw roomError;

    const { data: faculties, error: facultyError } = await supabase.from(
      "teacher_profile"
    ).select(`
        id,
        user_profile:user_id (
          id,
          name,
          email
        )
      `);
    if (facultyError) throw facultyError;

    const { data: sections, error: sectionError } = await supabase
      .from("sections")
      .select("id, name");
    if (sectionError) throw sectionError;

    return res.status(200).json({
      title: "Success",
      message: "Data master retrieved successfully.",
      data: {
        subjects,
        rooms,
        faculties,
        sections,
      },
    });
  } catch (error) {
    console.error("Error retrieving data master:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getDataMaster,
};

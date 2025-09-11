const supabase = require("../../supabase");

const recordLog = async (req, res) => {
  try {

  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
}

const getLogs = async (req, res) => {
  try {




  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
}

const getSchedule = async (req, res) => {
  try {

  } catch (error) {
    console.error("Error", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
}


module.exports = {
  recordLog,
  getLogs,
  getSchedule
};

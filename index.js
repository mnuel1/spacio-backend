import express from 'express';
import dotenv from 'dotenv';
import studentRouter from './src/student/route';
import facultyRouter from './src/faculty/route';
import coordinatorRouter from './src/coordinator/route';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/student', studentRouter);
app.use('/faculty', facultyRouter);
app.use('/coordinator', coordinatorRouter);

app.get('/', (req, res) => {
  res.send('Hello from Express with Supabase!');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

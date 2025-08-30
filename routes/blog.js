const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');
const Student = require('../models/Student'); // Make sure to import Student model
const multer = require('multer');
const path = require('path');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/blog-images/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Helper function to get student by rollNo
const getStudentByRollNo = async (rollNo) => {
  try {
    const student = await Student.findOne({ rollNo });
    return student;
  } catch (error) {
    console.error('Error finding student:', error);
    return null;
  }
};

// Create a new blog post
router.post('/', upload.array('images', 5), async (req, res) => {
    console.log("data",req.body)
  try {
    const { title, content, tags, isPublished, rollNo } = req.body;
    
    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required' });
    }

    const student = await getStudentByRollNo(rollNo);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log("📸 Uploaded files:", req.files);
    console.log("📝 Body:", req.body);

    const blogPost = new BlogPost({
      title: title?.trim(),
      content: content?.trim(),
      author: {
        _id: student._id,
        studentName: student.studentName,
        rollNo: student.rollNo
      },
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      isPublished: isPublished === "true"
    });

    if (req.files && req.files.length > 0) {
      blogPost.images = req.files.map(file => `/uploads/blog-images/${file.filename}`);
    }

    await blogPost.save();
    
    res.status(201).json(blogPost);
  } catch (error) {
    console.error('❌ Error creating blog post:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all published blog posts
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const blogPosts = await BlogPost.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BlogPost.countDocuments({ isPublished: true });

    res.json({
      blogPosts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get blog posts by student rollNo
router.get('/student/:rollNo', async (req, res) => {
  try {
    const { rollNo } = req.params;
    
    // Find student by rollNo
    const student = await getStudentByRollNo(rollNo);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const blogPosts = await BlogPost.find({ 
      'author._id': student._id,
      isPublished: true 
    }).sort({ createdAt: -1 });

    res.json(blogPosts);
  } catch (error) {
    console.error('Error fetching student blog posts:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single blog post
router.get('/:id', async (req, res) => {
  try {
    const blogPost = await BlogPost.findById(req.params.id);

    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    res.json(blogPost);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update blog post
router.put('/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { rollNo } = req.body;
    const blogPost = await BlogPost.findById(req.params.id);
    
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required' });
    }

    // Check if the student is the author
    if (blogPost.author.rollNo !== rollNo) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, content, tags, isPublished } = req.body;
    
    if (title) blogPost.title = title;
    if (content) blogPost.content = content;
    if (tags) blogPost.tags = tags.split(',').map(tag => tag.trim());
    if (isPublished !== undefined) blogPost.isPublished = isPublished;

    // Add new images if any
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.path);
      blogPost.images = [...blogPost.images, ...newImages];
    }

    await blogPost.save();
    res.json(blogPost);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete blog post
router.delete('/:id', async (req, res) => {
  try {
    const { rollNo } = req.body;
    const blogPost = await BlogPost.findById(req.params.id);
    
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required' });
    }

    // Check if the student is the author
    if (blogPost.author.rollNo !== rollNo) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await BlogPost.findByIdAndDelete(req.params.id);
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Like/Unlike blog post
router.post('/:id/like', async (req, res) => {
  try {
    const { rollNo } = req.body;
    const blogPost = await BlogPost.findById(req.params.id);
    
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required' });
    }

    // Check if student already liked the post
    const likeIndex = blogPost.likes.findIndex(like => like.student === rollNo);
    
    if (likeIndex === -1) {
      // Like the post
      blogPost.likes.push({ student: rollNo });
    } else {
      // Unlike the post
      blogPost.likes.splice(likeIndex, 1);
    }

    await blogPost.save();
    res.json(blogPost);
  } catch (error) {
    console.error('Error liking blog post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add comment
router.post('/:id/comment', async (req, res) => {
  try {
    const { text, rollNo } = req.body;
    
    if (!rollNo) {
      return res.status(400).json({ message: 'Roll number is required' });
    }

    const blogPost = await BlogPost.findById(req.params.id);
    
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Find student by rollNo
    const student = await getStudentByRollNo(rollNo);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    blogPost.comments.push({
      student: {
        _id: student._id,
        studentName: student.studentName,
        rollNo: student.rollNo
      },
      text
    });

    await blogPost.save();
    
    // Get the new comment
    const newComment = blogPost.comments[blogPost.comments.length - 1];
    
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
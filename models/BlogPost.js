const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  author: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    studentName: {
      type: String,
      required: true
    },
    rollNo: {
      type: String,
      required: true
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  images: [{
    type: String
  }],
  isPublished: {
    type: Boolean,
    default: false
  },
  likes: [{
    student: {
      type: String, // Store rollNo for likes
      required: true
    }
  }],
  comments: [{
    student: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
      },
      studentName: {
        type: String,
        required: true
      },
      rollNo: {
        type: String,
        required: true
      }
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
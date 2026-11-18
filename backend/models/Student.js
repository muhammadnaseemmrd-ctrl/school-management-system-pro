const mongoose = require('../lib/pgdoc');

const studentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    schoolCode: {
      type: String,
      default: '',
    },
    schoolName: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 2592000, // 30 days
        },
      },
    ],
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // --- Detailed Student Schema ---

    // 1. Basic Student Information
    studentId: {
      type: String,
      default: () => 'STD' + Math.floor(100000 + Math.random() * 900000), // Auto Generated Student ID
    },
    admissionNumber: {
      type: String,
    },
    rollNumber: {
      type: String,
    },
    firstName: {
      type: String,
      default: '',
    },
    middleName: {
      type: String,
      default: '',
    },
    lastName: {
      type: String,
      default: '',
    },
    fullName: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    dateOfBirth: Date,
    bloodGroup: String,
    photo: String, // URL
    cnicNumber: {
      type: String,
      default: '',
    },
    nationality: {
      type: String,
      default: 'Pakistani',
    },
    religion: {
      type: String,
      default: '',
    },
    motherTongue: {
      type: String,
      default: '',
    },

    // 2. Contact Information
    mobileNumber: String,
    alternateMobileNumber: String,
    currentAddress: String,
    permanentAddress: String,
    city: String,
    province: String,
    country: {
      type: String,
      default: 'Pakistan',
    },
    postalCode: String,

    // 3. Parent/Guardian Details
    father: {
      name: { type: String, default: '' },
      occupation: { type: String, default: '' },
      mobileNumber: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    mother: {
      name: { type: String, default: '' },
      occupation: { type: String, default: '' },
      mobileNumber: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    guardian: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      mobileNumber: { type: String, default: '' },
      address: { type: String, default: '' },
    },

    // 4. Academic Information
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    division: {
      type: String,
    },
    house: {
      type: String,
      default: '',
    },
    academicYear: {
      type: String,
      default: '',
    },
    admissionDate: {
      type: Date,
      default: Date.now,
    },
    previousSchool: {
      type: String,
      default: 'Fresh',
    },
    studentStatus: {
      type: String,
      enum: ['Active', 'Graduated', 'Transferred', 'Suspended'],
      default: 'Active',
    },
    medium: {
      type: String,
      default: 'English',
    },
    subjectsEnrolled: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
      },
    ],

    // 8. Health Information
    allergies: { type: String, default: '' },
    medicalConditions: { type: String, default: '' },
    disability: { type: String, default: '' },
    emergencyContact: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      mobileNumber: { type: String, default: '' },
    },
    doctorName: { type: String, default: '' },
    medicalNotes: { type: String, default: '' },

    // 9. Transport Details
    usesSchoolBus: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'No',
    },
    busRoute: { type: String, default: '' },
    busStop: { type: String, default: '' },
    busNumber: { type: String, default: '' },
    driverName: { type: String, default: '' },
    driverContact: { type: String, default: '' },

    // 10. Library Information
    libraryCardNumber: { type: String, default: '' },
    booksIssued: { type: Number, default: 0 },
    issueDate: Date,
    returnDate: Date,
    fine: { type: Number, default: 0 },
    bookStatus: { type: String, default: '' },

    // 12. Login Details
    username: { type: String },
    accountStatus: {
      type: String,
      enum: ['Active', 'Suspended', 'Inactive'],
      default: 'Active',
    },

    // 13. Documents
    documents: {
      birthCertificate: { type: String, default: '' },
      cnicCopy: { type: String, default: '' },
      previousMarksheet: { type: String, default: '' },
      transferCertificate: { type: String, default: '' },
      leavingCertificate: { type: String, default: '' },
      passportPhoto: { type: String, default: '' },
      parentIdProof: { type: String, default: '' },
      addressProof: { type: String, default: '' },
      incomeCertificate: { type: String, default: '' },
      domicileCertificate: { type: String, default: '' },
    },

    attendancePercentage: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Clean up empty string values for ObjectIds before validation
studentSchema.pre('validate', function (next) {
  if (this.classId === '') {
    this.classId = undefined;
  }
  next();
});

// Compound unique index: email + schoolId
studentSchema.index({ email: 1, schoolId: 1 }, { unique: true });

// Self-service profile (editable by the person) + uploaded documents
studentSchema.add({
  profileExtra: {
    about: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    emergencyName: { type: String, default: '' },
    emergencyPhone: { type: String, default: '' },
  },
  uploadedDocuments: [{
    title: { type: String, required: true },
    category: { type: String, default: 'Other' },
    url: { type: String, required: true },
    fileName: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  }],
});


// Query paths (indexing is part of the schema, so every environment gets it)
studentSchema.index({ schoolId: 1, classId: 1 });
studentSchema.index({ schoolId: 1, createdAt: -1 });
studentSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('Student', studentSchema);

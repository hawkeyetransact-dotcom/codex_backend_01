import { User } from "../models/userModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import moment from "moment";
import { addNotification } from "../utils/addNotification.js";


export const getAuditors = async (req, res) => {
  const { page, limit } = req.query;
  try {
    const query = { role: "auditor" };

    const auditors = await User.find(query)
      .select("-password -__v") // Exclude sensitive fields
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await User.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      auditors,
      totalRecords,
      totalPages,
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
export const getAllSuppliers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    // Populate user details
    const supplierProfiles = await SupplierProfile.find()
      .populate('user_id', 'firstName lastName email title addressline1 addressline2 addressline3 city state country zipcode')
      .limit(Number(limit))
      .skip(skip);

    // Format to what frontend expects
    const suppliers = supplierProfiles.map((profile) => {
      const user = profile.user_id;
      return {
        _id: profile._id,
        user_id: user?._id || null,
        companyName: profile.companyName,
        email: user?.email || '',
        firstName: user?.firstName || profile?.firstName,
        lastName: user?.lastName || profile?.lastName,
        title: user?.title || profile?.title,
        addressline1: user?.addressline1 || profile?.addressline1,
        addressline2: user?.addressline2 || profile?.addressline2,
        addressline3: user?.addressline3 || profile?.addressline3,
        city: user?.city || profile?.city,
        state: user?.state || profile?.state,
        country: user?.country || profile?.country,
        zipcode: user?.zipcode || profile?.zipcode,
        productCount: profile.productCount || 0,
        siteCount: profile.siteCount || 0,
      };
    });

    const totalRecords = await SupplierProfile.countDocuments();

    res.status(200).json({
      suppliers,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error('[getAllSuppliers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getAllSuppliersProfile = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    const suppliersProfile = await SupplierProfile.find()
      .select("-password -__v")
      .limit(Number(limit))
      .skip(skip)
      .lean(); // 💥 This is what gives you plain objects!

    const userIds = suppliersProfile.map((profile) => profile.user_id);

    const counts = await ProductSiteMappings.aggregate([
      {
        $match: {
          user_id: { $in: userIds },
        },
      },
      {
        $group: {
          _id: "$user_id",
          productIds: { $addToSet: "$product_id" },
          siteIds: { $addToSet: "$site_id" },
        },
      },
      {
        $project: {
          _id: 1,
          productCount: { $size: "$productIds" },
          siteCount: { $size: "$siteIds" },
        },
      },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id.toString()] = {
        productCount: c.productCount,
        siteCount: c.siteCount,
      };
    });

    // Merge counts into plain JS objects
    const enrichedProfiles = suppliersProfile.map((profile) => {
      const count = countMap[profile.user_id.toString()] || {
        productCount: 0,
        siteCount: 0,
      };
      return {
        ...profile,
        ...count,
      };
    });

    const totalRecords = await SupplierProfile.countDocuments();

    res.status(200).json({
      suppliersProfile: enrichedProfiles, // ✅ Clean format
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
};



// GET /api/buyer/sites - Fetch all supplier sites (irrespective of supplier)
export const getSites = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const sites = await SupplierSite.find()
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await SupplierSite.countDocuments();
    res.status(200).json({
      sites,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/buyer/site-products/:id - Fetch products linked to a specific site
export const getSiteProducts = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  try {
    const mappings = await ProductSiteMappings.find({ site_id: id })
      .populate("product_id")
      .populate("site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await ProductSiteMappings.countDocuments({
      site_id: id,
    });
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  try {
    const pipeline = [
      // Lookup product details from supplier-master-products
      {
        $lookup: {
          from: "supplier-master-products", // collection name as defined in your model
          localField: "product_id",
          foreignField: "_id",
          as: "product_id",
        },
      },
      // Unwind to convert product_id array to a single object; filter out if missing
      { $unwind: { path: "$product_id", preserveNullAndEmptyArrays: false } },

      // Lookup user details from users collection
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user_id",
        },
      },
      { $unwind: { path: "$user_id", preserveNullAndEmptyArrays: true } },

      // Lookup site details from supplier-sites collection
      {
        $lookup: {
          from: "supplier-sites",
          localField: "site_id",
          foreignField: "_id",
          as: "site_id",
        },
      },
      { $unwind: { path: "$site_id", preserveNullAndEmptyArrays: true } },

      // Facet to get paginated results and total count in one go
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: Number(limit) }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const results = await ProductSiteMappings.aggregate(pipeline);
    const data = results[0].data;
    const totalRecords = results[0].totalCount[0]
      ? results[0].totalCount[0].count
      : 0;

    res.status(200).json({
      mappings: data,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createAuditRequest = async (req, res) => {

  const { supplier_id, auditor_id, supplier_product_id, complianceDate, site_id } =
    req.body;

  const create_by_buyer_id = req.user._id;

  try {
    // Verify supplier_id is a user with role "supplier"
    const supplier = await User.findOne({ _id: supplier_id });
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier_id" });
    }

    // Verify auditor_id is a user with role "auditor"
    const auditor = await User.findOne({ _id: auditor_id });
    if (!auditor || auditor.role !== "auditor") {
      return res.status(400).json({ error: "Invalid auditor_id" });
    }

    // Find the product mapping for the given supplier product ID and ensure it belongs to the supplier
    const mapping = await ProductSiteMappings.findOne({
      product_id: supplier_product_id,
      user_id: supplier_id,
    });

    if (!mapping) {
      return res.status(400).json({
        error:
          "supplier_product_id does not belong to the specified supplier in the mapping",
      });
    }

    // Fetch the master product from supplier-master-products
    const masterProduct = await SupplierMasterProducts.findOne({
      _id: mapping.product_id,
    }).lean();

    if (!masterProduct) {
      return res.status(400).json({
        error: "Product not found in master records",
      });
    }
    // 👉 Check if an audit request already exists for this combination
    const existingRequest = await AuditRequestMaster.findOne({
      supplier_id,
      site_id,
      supplier_product_id: masterProduct._id,
    });

    if (existingRequest) {
      return res.status(409).json({
        error: "An audit request for this supplier, product, and site already exists.",
      });
    }

    const timeDifferenceInSeconds = moment(complianceDate, "dddd, MMMM Do, YYYY, hh:mm:ss A Z");
    const timeinsec = moment(timeDifferenceInSeconds).diff(moment(), 'seconds') / 9;

    // Create the audit request, including the new complianceDate field
    const auditRequest = new AuditRequestMaster({
      supplier_id,
      auditor_id,
      create_by_buyer_id,
      supplier_product_id: masterProduct._id,
      complianceDate,
      site_id,
      high_status: 1,
      trackStatus: "Request Received",
      questionnaireStatus: "request_received",
      requestReviewInProgressEta: moment().add(timeinsec, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      requestReviewCompleteEta: moment().add(timeinsec * 2, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      questionnaireSentEta: moment().add(timeinsec * 3, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      questionnaireReceivedEta: moment().add(timeinsec * 4, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseInProgressEta: moment().add(timeinsec * 5, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseCompleteEta: moment().add(timeinsec * 6, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReceivedEta: moment().add(timeinsec * 7, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReviewInProgressEta: moment().add(timeinsec * 8, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReviewCompleteEta: moment().add(timeinsec * 9, 'seconds').format('MMMM Do YYYY, h:mm:ss a')
    });
    await auditRequest.save();

    const buyer = await User.findById(create_by_buyer_id).lean();
    const buyerName = buyer?.name || buyer?.first_name || 'Unknown Buyer';
    const productName = masterProduct?.product_name || 'Unnamed Product';

    await addNotification({
      senderId: create_by_buyer_id,
      receiverId: auditor_id,
      senderRole: 'buyer',
      receiverRole: 'auditor',
      message: `Buyer ${buyerName} requested an audit for product: ${productName}.`,
      link: `/audits/${auditRequest._id}/template`
    });


    res.status(201).json({
      message: "Audit request created successfully",
      auditRequest,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createBuyerProfile = async (req, res) => {
  try {
    // Check if profile already exists for the buyer
    const existingProfile = await BuyerProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile) {
      return res.status(400).json({ error: "Profile already exists" });
    }
    const profile = new BuyerProfile({ user_id: req.user._id, ...req.body });
    await profile.save();
    res
      .status(201)
      .json({ message: "Buyer profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBuyerProfile = async (req, res) => {
  try {
    const profile = await BuyerProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    await BuyerProfile.updateOne({ user_id: req.user._id }, req.body);
    res.status(200).json({ message: "Buyer profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductsBySupplier = async (req, res) => {
  const { supplier_id, page = 1, limit = 10 } = req.query;
  try {
    if (!supplier_id) {
      return res
        .status(400)
        .json({ error: "supplier_id query parameter is required" });
    }
    const query = { user_id: supplier_id };
    const mappings = await ProductSiteMappings.find(query)
      .populate("user_id")
      .populate("site_id")
      .populate("product_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await ProductSiteMappings.countDocuments(query);
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSitesBySupplier = async (req, res) => {
  const { supplier_id, page = 1, limit = 10 } = req.query;
  try {
    if (!supplier_id) {
      return res
        .status(400)
        .json({ error: "supplier_id query parameter is required" });
    }
    const query = { user_id: supplier_id };
    const mappings = await SupplierSite.find(query)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await SupplierSite.countDocuments(query);
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getAllAuditors = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const query = { role: "auditor" };
    const auditors = await User.find(query)
      .select("-password -__v")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await User.countDocuments(query);
    res.status(200).json({
      auditors,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getSupplierByID = async (req, res) => {
  const { id } = req.params; // supplierProfile._id
  const { page = 1, limit = 10 } = req.query;

  try {
    // Step 1: Fetch supplier profile by _id
    const supplierProfile = await SupplierProfile.findById(id).lean();

    if (!supplierProfile) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Step 1.1: Get user email from User collection
    const user = await User.findOne({ _id: supplierProfile.user_id }).select("email").lean();
    const email = user?.email || null;

    // Add email to supplierProfile
    supplierProfile.email = email;

    // Step 2: Fetch paginated product-site mappings for the supplier's user_id
    const mappings = await ProductSiteMappings.find({ user_id: supplierProfile.user_id })
      .populate("product_id")
      .populate("site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    if (!mappings.length) {
      return res.status(404).json({ error: "No product mappings found for this supplier" });
    }

    // Step 3: Add supplierProfileInfo (now with email) to each mapping item
    const enrichedMappings = mappings.map(mapping => ({
      ...mapping,
      supplierProfileInfo: supplierProfile,
    }));

    // Step 4: Return response
    res.status(200).json(enrichedMappings);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }




};

export const updateAuditRequest = async (req, res) => {
  const { id } = req.params;
  const {
    complianceDate,
    requestReviewInProgress,
    nextAuditOn,
    trackStatus,
    highStatus,
    isTemplateUsed,
    questionnaireStatus,
    selectedTemplateId
  } = req.body;

  try {
    const auditRequest = await AuditRequestMaster.findById(id);
    if (!auditRequest) {
      return res.status(404).json({ error: 'Audit request not found' });
    }

    // Update fields
    if (complianceDate !== undefined) auditRequest.complianceDate = complianceDate;
    if (requestReviewInProgress !== undefined) auditRequest.requestReviewInProgress = requestReviewInProgress;
    if (nextAuditOn !== undefined) auditRequest.nextAuditOn = nextAuditOn;
    if (trackStatus !== undefined) auditRequest.trackStatus = trackStatus;
    if (highStatus !== undefined) auditRequest.high_status = highStatus;
    if (isTemplateUsed !== undefined) auditRequest.isTempleteUsed = isTemplateUsed;
    if (questionnaireStatus !== undefined) auditRequest.questionnaireStatus = questionnaireStatus;
    if (selectedTemplateId !== undefined) auditRequest.selectedTemplateId = selectedTemplateId;

    await auditRequest.save();

    // Fetch names and product
    const [auditor, supplier, product] = await Promise.all([
      User.findById(auditRequest.auditor_id).lean(),
      User.findById(auditRequest.supplier_id).lean(),
      SupplierMasterProducts.findById(auditRequest.supplier_product_id).lean()
    ]);

    const auditorName = auditor?.name || auditor?.first_name || 'Auditor';
    const supplierName = supplier?.name || supplier?.first_name || 'Supplier';
    const productName = product?.product_name || 'Product';

    // Notification logic
    if (nextAuditOn === 'auditor') {
      // Supplier responded → notify auditor
      await addNotification({
        senderId: auditRequest.supplier_id,
        receiverId: auditRequest.auditor_id,
        senderRole: 'supplier',
        receiverRole: 'auditor',
        message: `Supplier ${supplierName} has responded for product: ${productName}.`,
        link: `/audits/${auditRequest._id}/responses`
      });
    } else if (nextAuditOn === 'supplier') {
      // Auditor updated → notify supplier
      await addNotification({
        senderId: auditRequest.auditor_id,
        receiverId: auditRequest.supplier_id,
        senderRole: 'auditor',
        receiverRole: 'supplier',
        message: `Auditor ${auditorName} updated the audit request for product: ${productName}.`,
        link: `/supplier/audits/${auditRequest._id}/questionnaire`
      });
    }


    return res.status(200).json({
      message: 'Audit request updated successfully',
      auditRequest
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};




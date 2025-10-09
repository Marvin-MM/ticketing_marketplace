import express from 'express';
import { asyncHandler } from '../../../shared/middleware/errorHandler.js';
import { ensureAuthenticated, ensureRoles, ensureApprovedSeller } from '../../auth/middleware/auth.middleware.js';
import {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  getSellerCampaigns,
  updateCampaignStatus,
  getCampaignAnalytics,
  assignManagers,
  uploadCoverImage,
  uploadGalleryImages,
  deleteImage,
  searchCampaigns,
  getFeaturedCampaigns,
  getSearchSuggestions,
  getNearbyCampaigns,
} from '../controllers/campaign.controller.js';
import { validateCampaign, validateCampaignUpdate } from '../validators/campaign.validator.js';
// import { upload } from '../../../shared/middleware/multer.js'; 

const router = express.Router();

// Public routes
router.get('/', asyncHandler(getAllCampaigns));
router.get('/search', asyncHandler(searchCampaigns));
router.get('/featured', asyncHandler(getFeaturedCampaigns));
router.get('/suggestions', asyncHandler(getSearchSuggestions));
router.get('/nearby', asyncHandler(getNearbyCampaigns));
router.get('/:campaignId', asyncHandler(getCampaignById));
router.get('/:campaignId/analytics', asyncHandler(getCampaignAnalytics));

// Protected routes (Seller only)
router.post('/', ensureApprovedSeller, validateCampaign, asyncHandler(createCampaign));
router.get('/seller/my-campaigns', ensureApprovedSeller, asyncHandler(getSellerCampaigns));
router.put('/:campaignId', ensureApprovedSeller, validateCampaignUpdate, asyncHandler(updateCampaign));
router.patch('/:campaignId/status', ensureApprovedSeller, asyncHandler(updateCampaignStatus));
router.post('/:campaignId/managers', ensureApprovedSeller, asyncHandler(assignManagers));
router.delete('/:campaignId', ensureApprovedSeller, asyncHandler(deleteCampaign));

// // Image upload routes 
// router.post('/:campaignId/cover-image', ensureApprovedSeller, upload.single('coverImage'), asyncHandler(uploadCoverImage));
// router.post('/:campaignId/gallery-images', ensureApprovedSeller, upload.array('galleryImages', 10), asyncHandler(uploadGalleryImages));
router.delete('/:campaignId/images/:imageType', ensureApprovedSeller, asyncHandler(deleteImage));

export default router;
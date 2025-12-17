// import PDFKit from 'pdfkit';
// import QRCode from 'qrcode';
// import { v2 as cloudinary } from 'cloudinary';
// import prisma from '../../config/database.js';
// import logger from '../../config/logger.js';
// import { generateQRData } from '../utils/encryption.js';
// import config from '../../config/index.js';

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: config.cloudinary.cloudName,
//   api_key: config.cloudinary.apiKey,
//   api_secret: config.cloudinary.apiSecret,
// });

// /**
//  * Generate PDF ticket with embedded QR code
//  */
// export const generateTicketPDF = async (ticketData) => {
//   const {
//     ticketId,
//     ticketNumber,
//     bookingRef,
//     customerName,
//     customerEmail,
//     eventDetails,
//   } = ticketData;

//   try {
//     // Get full ticket details
//     const ticket = await prisma.ticket.findUnique({
//       where: { id: ticketId },
//       include: {
//         campaign: {
//           select: {
//             title: true,
//             eventDate: true,
//             venue: true,
//             venueAddress: true,
//             venueCity: true,
//             coverImage: true,
//           },
//         },
//         booking: {
//           select: {
//             bookingRef: true,
//             quantity: true,
//             totalAmount: true,
//             issuanceType: true,
//           },
//         },
//       },
//     });

//     if (!ticket) {
//       throw new Error('Ticket not found');
//     }

//     // Generate encrypted QR code data
//     const qrData = generateQRData(ticket);
    
//     // Generate QR code as buffer
//     const qrBuffer = await QRCode.toBuffer(qrData, {
//       type: 'png',
//       width: 200,
//       margin: 1,
//       color: {
//         dark: '#000000',
//         light: '#FFFFFF',
//       },
//     });

//     // Create PDF document
//     const doc = new PDFKit({
//       size: 'A4',
//       margins: {
//         top: 50,
//         bottom: 50,
//         left: 50,
//         right: 50,
//       },
//     });

//     // Add company branding
//     doc.fontSize(24)
//        .fillColor('#2563eb')
//        .text(config.app.name, 50, 50, { align: 'center' });

//     // Add title
//     doc.fontSize(20)
//        .fillColor('#1f2937')
//        .text('EVENT TICKET', 50, 100, { align: 'center' });

//     // Add ticket number
//     doc.fontSize(12)
//        .fillColor('#6b7280')
//        .text(`Ticket #${ticketNumber}`, 50, 130, { align: 'center' });

//     // Event details section
//     doc.fontSize(18)
//        .fillColor('#1f2937')
//        .text(ticket.campaign.title, 50, 170, { width: 400 });

//     // Event info
//     const eventDate = new Date(ticket.campaign.eventDate);
//     doc.fontSize(12)
//        .fillColor('#374151')
//        .text(`Date: ${eventDate.toLocaleDateString('en-US', {
//          weekday: 'long',
//          year: 'numeric',
//          month: 'long',
//          day: 'numeric'
//        })}`, 50, 210)
//        .text(`Time: ${eventDate.toLocaleTimeString('en-US', {
//          hour: '2-digit',
//          minute: '2-digit'
//        })}`, 50, 230)
//        .text(`Venue: ${ticket.campaign.venue}`, 50, 250)
//        .text(`Address: ${ticket.campaign.venueAddress}, ${ticket.campaign.venueCity}`, 50, 270);

//     // Ticket details
//     doc.fontSize(14)
//        .fillColor('#1f2937')
//        .text('Ticket Details', 50, 310);

//     doc.fontSize(12)
//        .fillColor('#374151')
//        .text(`Type: ${ticket.ticketType.toUpperCase()}`, 50, 335)
//        .text(`Holder: ${customerName}`, 50, 355)
//        .text(`Booking Ref: ${ticket.booking.bookingRef}`, 50, 375);

//     if (ticket.campaign.isMultiScan) {
//       doc.text(`Max Entries: ${ticket.maxScans}`, 50, 395)
//          .text(`Remaining: ${ticket.maxScans - ticket.scanCount}`, 50, 415);
//     }

//     // QR Code section
//     doc.fontSize(14)
//        .fillColor('#1f2937')
//        .text('Scan to Validate', 350, 310, { align: 'center', width: 200 });

//     // Embed QR code
//     doc.image(qrBuffer, 400, 335, { 
//       width: 100, 
//       height: 100,
//       align: 'center'
//     });

//     // Add QR code instructions
//     doc.fontSize(10)
//        .fillColor('#6b7280')
//        .text('Present this QR code at the venue for entry', 350, 450, { 
//          align: 'center', 
//          width: 200 
//        });

//     // Add terms and conditions
//     doc.fontSize(8)
//        .fillColor('#9ca3af')
//        .text('Terms & Conditions:', 50, 500)
//        .text('• This ticket is non-transferable and non-refundable', 50, 515)
//        .text('• Valid only for the date and event specified', 50, 525)
//        .text('• Entry subject to venue policies and security checks', 50, 535)
//        .text('• No outside food or beverages allowed', 50, 545);

//     // Add footer
//     doc.fontSize(8)
//        .fillColor('#9ca3af')
//        .text(`Generated on ${new Date().toLocaleDateString()}`, 50, 580)
//        .text('For support, contact: support@ticketingmarketplace.com', 350, 580, { align: 'right' });

//     // Convert PDF to buffer
//     const pdfBuffer = await new Promise((resolve, reject) => {
//       const chunks = [];
//       doc.on('data', chunk => chunks.push(chunk));
//       doc.on('end', () => resolve(Buffer.concat(chunks)));
//       doc.on('error', reject);
//       doc.end();
//     });

//     // Upload PDF to Cloudinary
//     const uploadResult = await new Promise((resolve, reject) => {
//       cloudinary.uploader.upload_stream(
//         {
//           resource_type: 'auto',
//           public_id: `tickets/${ticketNumber}`,
//           format: 'pdf',
//           folder: 'ticket-pdfs',
//         },
//         (error, result) => {
//           if (error) reject(error);
//           else resolve(result);
//         }
//       ).end(pdfBuffer);
//     });

//     // Update ticket with QR code and PDF URL
//     const updatedTicket = await prisma.ticket.update({
//       where: { id: ticketId },
//       data: {
//         qrCode: qrData,
//         pdfUrl: uploadResult.secure_url,
//       },
//     });

//     logger.info('Ticket PDF generated successfully', {
//       ticketId,
//       ticketNumber,
//       pdfUrl: uploadResult.secure_url,
//     });

//     return {
//       ticketId: updatedTicket.id,
//       pdfUrl: uploadResult.secure_url,
//       qrData,
//     };
//   } catch (error) {
//     logger.error('Error generating ticket PDF:', error);
//     throw error;
//   }
// };

// /**
//  * Generate invoice PDF
//  */
// export const generateInvoicePDF = async (invoiceData) => {
//   const {
//     bookingId,
//     customerName,
//     customerEmail,
//     items,
//     total,
//   } = invoiceData;

//   try {
//     // Create PDF document
//     const doc = new PDFKit({ size: 'A4', margin: 50 });

//     // Add invoice header
//     doc.fontSize(20)
//        .text(config.app.name, 50, 50)
//        .fontSize(16)
//        .text('INVOICE', 450, 50, { align: 'right' });

//     // Add customer details
//     doc.fontSize(12)
//        .text(`Customer: ${customerName}`, 50, 120)
//        .text(`Email: ${customerEmail}`, 50, 140)
//        .text(`Booking ID: ${bookingId}`, 50, 160)
//        .text(`Date: ${new Date().toLocaleDateString()}`, 50, 180);

//     // Add items table
//     let yPosition = 220;
//     doc.text('Description', 50, yPosition)
//        .text('Quantity', 300, yPosition)
//        .text('Price', 400, yPosition)
//        .text('Total', 480, yPosition);

//     yPosition += 20;
//     doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
//     yPosition += 10;

//     items.forEach(item => {
//       doc.text(item.description, 50, yPosition)
//          .text(item.quantity.toString(), 300, yPosition)
//          .text(`$${item.price}`, 400, yPosition)
//          .text(`$${item.total}`, 480, yPosition);
//       yPosition += 20;
//     });

//     // Add total
//     yPosition += 20;
//     doc.fontSize(14)
//        .text(`Total: $${total}`, 400, yPosition, { align: 'right' });

//     // Convert to buffer and upload
//     const pdfBuffer = await new Promise((resolve, reject) => {
//       const chunks = [];
//       doc.on('data', chunk => chunks.push(chunk));
//       doc.on('end', () => resolve(Buffer.concat(chunks)));
//       doc.on('error', reject);
//       doc.end();
//     });

//     const uploadResult = await new Promise((resolve, reject) => {
//       cloudinary.uploader.upload_stream(
//         {
//           resource_type: 'auto',
//           public_id: `invoices/${bookingId}`,
//           format: 'pdf',
//           folder: 'invoices',
//         },
//         (error, result) => {
//           if (error) reject(error);
//           else resolve(result);
//         }
//       ).end(pdfBuffer);
//     });

//     return uploadResult.secure_url;
//   } catch (error) {
//     logger.error('Error generating invoice PDF:', error);
//     throw error;
//   }
// };
import PDFKit from 'pdfkit';
import QRCode from 'qrcode';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../../config/database.js';
import logger from '../../config/logger.js';
import { generateQRData } from '../utils/encryption.js';
import config from '../../config/index.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios'; // Required for fetching remote cover images

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Helper to safely fetch remote image buffers
 */
const fetchImageBuffer = async (url) => {
  if (!url) return null;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    logger.warn(`Failed to fetch image from ${url}: ${error.message}`);
    return null;
  }
};

/**
 * Generate PDF ticket with embedded QR code, Logos, and Cover Image
 */
export const generateTicketPDF = async (ticketData) => {
  const { ticketId, ticketNumber, customerName } = ticketData;

  try {
    // 1. Fetch full ticket details
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        campaign: {
          select: {
            title: true,
            eventDate: true,
            venue: true,
            venueAddress: true,
            venueCity: true,
            coverImage: true,
          },
        },
        booking: {
          select: {
            bookingRef: true,
            quantity: true,
            totalAmount: true,
            issuanceType: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // 2. Prepare Assets (Concurrent fetching for speed)
    const qrData = generateQRData(ticket);
    const publicDir = path.join(process.cwd(), 'public');
    const logoPath = path.join(publicDir, 'luco-water.png');
    const watermarkPath = path.join(publicDir, 'logo-logo.png');

    const [qrBuffer, coverImageBuffer] = await Promise.all([
      QRCode.toBuffer(qrData, {
        type: 'png',
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      }),
      fetchImageBuffer(ticket.campaign.coverImage),
    ]);

    // 3. Initialize PDF Document
    const doc = new PDFKit({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: `Ticket - ${ticket.campaign.title}`,
        Author: config.app.name,
      }
    });

    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // --- A. WATERMARK BACKGROUND ---
    if (fs.existsSync(watermarkPath)) {
      const watermarkSize = 300;
      doc.save()
         .opacity(0.1) // Subtle watermark
         .image(watermarkPath, 
           (doc.page.width - watermarkSize) / 2, 
           (doc.page.height - watermarkSize) / 2, 
           { width: watermarkSize }
         )
         .restore();
    }

    // --- B. HEADER SECTION (Logo + Ticket #) ---
    const headerY = 40;
    
    // Company Logo (Left)
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, headerY, { height: 50 });
    } else {
      // Fallback text if logo missing
      doc.fontSize(20).fillColor('#2563eb').text(config.app.name, 40, headerY);
    }

    // Ticket ID Badge (Right)
    doc.fontSize(10)
       .fillColor('#6b7280')
       .text('TICKET ID', 400, headerY, { align: 'right' })
       .fontSize(14)
       .fillColor('#111827')
       .font('Helvetica-Bold')
       .text(`#${ticketNumber}`, 400, headerY + 15, { align: 'right' });

    // Separator Line
    doc.moveTo(40, 100).lineTo(555, 100).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // --- C. HERO SECTION (Cover Image) ---
    let currentY = 120;
    if (coverImageBuffer) {
      try {
        doc.image(coverImageBuffer, 40, currentY, {
          width: 515,
          height: 180,
          fit: [515, 180],
          align: 'center',
          valign: 'center'
        });
        // Draw a border around the image
        doc.rect(40, currentY, 515, 180).strokeColor('#e5e7eb').stroke();
        currentY += 200; // Move cursor down
      } catch (err) {
        logger.warn('Failed to render cover image to PDF');
      }
    }

    // --- D. EVENT DETAILS ---
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1f2937')
       .text(ticket.campaign.title, 40, currentY, { width: 515, align: 'center' });
    
    currentY += 40;

    // Date & Venue Box
    const eventDate = new Date(ticket.campaign.eventDate);
    const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    doc.rect(40, currentY, 515, 80).fillColor('#f3f4f6').fill();
    
    // Date Column
    doc.fillColor('#1f2937').fontSize(10).font('Helvetica')
       .text('DATE & TIME', 60, currentY + 15)
       .font('Helvetica-Bold').fontSize(12)
       .text(dateStr, 60, currentY + 30)
       .text(timeStr, 60, currentY + 45);

    // Venue Column
    doc.fillColor('#1f2937').fontSize(10).font('Helvetica')
       .text('VENUE', 300, currentY + 15)
       .font('Helvetica-Bold').fontSize(12)
       .text(ticket.campaign.venue, 300, currentY + 30)
       .font('Helvetica').fontSize(10)
       .text(`${ticket.campaign.venueAddress}, ${ticket.campaign.venueCity}`, 300, currentY + 50, { width: 200 });

    currentY += 100;

    // --- E. TICKET & QR SECTION ---
    // Left Side: Details
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937')
       .text('ADMIT ONE', 40, currentY);
    
    doc.moveTo(40, currentY + 20).lineTo(200, currentY + 20).strokeColor('#2563eb').lineWidth(2).stroke();

    const detailY = currentY + 40;
    const labelX = 40;
    const valueX = 120;

    const addDetail = (label, value, y) => {
      doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text(label, labelX, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text(value, valueX, y);
    };

    addDetail('Type:', ticket.ticketType.toUpperCase(), detailY);
    addDetail('Holder:', customerName, detailY + 25);
    addDetail('Ref:', ticket.booking.bookingRef, detailY + 50);
    
    if (ticket.campaign.isMultiScan) {
      addDetail('Entries:', `${ticket.maxScans} Total`, detailY + 75);
    }

    // Right Side: QR Code
    doc.image(qrBuffer, 350, currentY, { width: 150, height: 150 });
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
       .text('Scan at entrance', 350, currentY + 155, { width: 150, align: 'center' });

    // --- F. FOOTER ---
    const pageHeight = doc.page.height;
    
    // Terms
    doc.fontSize(8).fillColor('#9ca3af')
       .text('Terms & Conditions: Non-transferable. Valid only for specified event.', 40, pageHeight - 80, { align: 'center' });

    doc.end();

    // 4. Handle PDF Stream & Upload
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: `tickets/${ticketNumber}`,
          format: 'pdf',
          folder: 'ticket-pdfs',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(pdfBuffer);
    });

    // 5. Update Database
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        qrCode: qrData,
        pdfUrl: uploadResult.secure_url,
      },
    });

    logger.info('Ticket PDF generated successfully', { ticketId, url: uploadResult.secure_url });

    return {
      ticketId: updatedTicket.id,
      pdfUrl: uploadResult.secure_url,
      qrData,
    };

  } catch (error) {
    logger.error('Error generating ticket PDF:', error);
    throw error;
  }
};

/**
 * Generate invoice PDF (Kept as is, but robust logic can be applied here too)
 */
export const generateInvoicePDF = async (invoiceData) => {
  // ... (Keep existing implementation if not modifying invoice logic yet)
  // To keep the response concise, I'm assuming you primarily needed the Ticket PDF robust.
  // If you need the invoice updated similarly, the same patterns apply.
  const { bookingId, customerName, customerEmail, items, total } = invoiceData;

  try {
    const doc = new PDFKit({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Simple Header
    doc.fontSize(20).text(config.app.name, 50, 50)
       .fontSize(16).text('INVOICE', 450, 50, { align: 'right' });

    // Customer Details
    doc.fontSize(12).text(`Customer: ${customerName}`, 50, 120)
       .text(`Email: ${customerEmail}`, 50, 140)
       .text(`Booking ID: ${bookingId}`, 50, 160)
       .text(`Date: ${new Date().toLocaleDateString()}`, 50, 180);

    // Table Header
    let yPosition = 220;
    doc.font('Helvetica-Bold');
    doc.text('Description', 50, yPosition)
       .text('Quantity', 300, yPosition)
       .text('Price', 400, yPosition)
       .text('Total', 480, yPosition);
    
    doc.moveTo(50, yPosition + 15).lineTo(550, yPosition + 15).stroke();
    yPosition += 30;
    doc.font('Helvetica');

    // Items
    items.forEach(item => {
      doc.text(item.description, 50, yPosition)
         .text(item.quantity.toString(), 300, yPosition)
         .text(`${item.price}`, 400, yPosition)
         .text(`${item.total}`, 480, yPosition);
      yPosition += 20;
    });

    doc.fontSize(14).font('Helvetica-Bold')
       .text(`Total: ${total}`, 400, yPosition + 20, { align: 'right' });

    doc.end();

    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: `invoices/${bookingId}`,
          format: 'pdf',
          folder: 'invoices',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(pdfBuffer);
    });

    return uploadResult.secure_url;
  } catch (error) {
    logger.error('Error generating invoice PDF:', error);
    throw error;
  }
};
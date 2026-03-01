-- AlterTable
ALTER TABLE "LabMessage" ADD COLUMN     "mentorId" TEXT,
ADD COLUMN     "round" INTEGER;

-- AlterTable
ALTER TABLE "LabSession" ADD COLUMN     "groupConfig" JSONB;

ALTER TABLE wsh2_washes ADD COLUMN wash_details TEXT NOT NULL DEFAULT '' CHECK(length(wash_details) <= 120);

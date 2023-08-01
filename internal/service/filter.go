package service

func GetEarliestEntry(entries []TimeEntry) *TimeEntry {
	if len(entries) == 0 {
		return nil
	}

	earliestEntry := entries[0]
	for _, entry := range entries {
		if entry.TimeEntry.Start.Compare(earliestEntry.TimeEntry.Start) == -1 {
			earliestEntry = entry
		}
	}
	return &earliestEntry
}

func GetLatestEntry(entries []TimeEntry) *TimeEntry {
	if len(entries) == 0 {
		return nil
	}

	latestEntry := entries[0]
	for _, entry := range entries {
		if entry.TimeEntry.Start.Compare(latestEntry.TimeEntry.Start) == 1 {
			latestEntry = entry
		}
	}
	return &latestEntry
}

func IgnoreRunningEntries(entries []TimeEntry) []TimeEntry {
	filtered := []TimeEntry{}
	for _, entry := range entries {
		if entry.TimeEntry.Duration >= 0 {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func FilterByClientName(entries []TimeEntry, clientName string) []TimeEntry {
	filtered := []TimeEntry{}
	for _, entry := range entries {
		if entry.Client != nil && entry.Client.Name == clientName {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

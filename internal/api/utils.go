package api

func GetProjectById(projects []ProjectDto, projectId *int) *ProjectDto {
	if projectId == nil {
		return nil
	}
	for _, project := range projects {
		if project.ID == *projectId {
			return &project
		}
	}
	return nil
}

func GetClientById(clients []ClientDto, clientId *int) *ClientDto {
	if clientId == nil {
		return nil
	}
	for _, client := range clients {
		if client.ID == *clientId {
			return &client
		}
	}
	return nil
}

func FilterEntriesForWorkspace(entries []TimeEntryDto, workspaceId int) []TimeEntryDto {
	filtered := []TimeEntryDto{}
	for _, entry := range entries {
		if entry.WorkspaceId == workspaceId {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

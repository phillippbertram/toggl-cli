package api

// https://developers.track.toggl.com/

import (
	"fmt"
	"time"

	"github.com/go-resty/resty/v2"
	"phillipp.io/toggl-cli/internal/utils"
)

type Api struct {
	httpClient *resty.Client
}

type ApiOpts struct {
	ApiToken string
}

type GetTimeEntriesOpts struct {
	// WorkspaceId int

	Since  *time.Time
	Before *time.Time

	// YYYY-MM-DD
	StartDate *time.Time

	// YYYY-MM-DD
	EndDate *time.Time
}

// Define the base URL for the Toggl Track API v9
const baseURL = "https://api.track.toggl.com/api/v9"

func NewApi(opts ApiOpts) *Api {
	client := resty.New().
		SetBaseURL(baseURL).
		SetDebug(false).
		SetBasicAuth(opts.ApiToken, "api_token")

	return &Api{
		httpClient: client,
	}
}

func (a *Api) GetMe() (*UserDto, error) {
	user := &UserDto{}
	_, err := a.httpClient.R().
		SetResult(user).
		Get("/me")
	return user, err
}

func (a *Api) GetProjectById(workspaceId int, projectId int) (*ProjectDto, error) {
	project := &ProjectDto{}
	_, err := a.httpClient.R().
		SetResult(project).
		Get(fmt.Sprintf("/workspaces/%d/projects/%d", workspaceId, projectId))
	return project, err
}

func (a *Api) GetProjects(workspaceId int) ([]ProjectDto, error) {
	projects := &[]ProjectDto{}
	_, err := a.httpClient.R().
		SetResult(projects).
		Get(fmt.Sprintf("/workspaces/%d/projects", workspaceId))
	return *projects, err
}

func (a *Api) GetProjectByName(workspaceId int, projectName string) (*ProjectDto, error) {
	projects, err := a.GetProjects(workspaceId)
	if err != nil {
		return nil, err
	}

	for _, project := range projects {
		if project.Name == projectName {
			return &project, nil
		}
	}

	return nil, fmt.Errorf("project not found")
}

func (a *Api) GetClients(workspaceId int) ([]ClientDto, error) {
	clients := &[]ClientDto{}
	_, err := a.httpClient.R().
		SetResult(clients).
		Get(fmt.Sprintf("/workspaces/%d/clients", workspaceId))
	return *clients, err
}

func (a *Api) GetClientById(workspaceId int, clientId int) (*ClientDto, error) {
	resp := &ClientDto{}
	_, err := a.httpClient.R().
		SetResult(resp).
		Get(fmt.Sprintf("/workspaces/%d/clients/%d", workspaceId, clientId))
	return resp, err
}

// https://developers.track.toggl.com/docs/api/time_entries
func (a *Api) GetTimeEntries(opts *GetTimeEntriesOpts) ([]TimeEntryDto, error) {
	fmt.Printf("GetTimeEntries opts: %+v\n", opts)

	q := map[string]string{}

	if opts.Since != nil {
		q["since"] = fmt.Sprintf("%d", opts.Since.Local().Unix())
	}

	start := opts.StartDate
	if opts.StartDate == nil {
		date := utils.GetStartOfMonth()
		start = &date
	}

	end := opts.EndDate
	if opts.EndDate == nil {
		endDate := utils.GetLastDayOfMonth()
		end = &endDate
	}

	if opts.Before != nil {
		q["before"] = opts.Before.Local().Format(utils.DATE_TIME_FORMAT)
	}

	if start != nil {
		q["start_date"] = start.Format(utils.DATE_TIME_FORMAT)
	}

	if end != nil {
		q["end_date"] = end.Format(utils.DATE_TIME_FORMAT)
	}

	fmt.Printf("GetTimeEntries query: %+v\n", q)

	entries := &[]TimeEntryDto{}
	_, err := a.httpClient.R().
		SetHeader("Accept", "application/json").
		SetQueryParams(q).
		SetResult(entries).
		Get("/me/time_entries")

	// fmt.Printf("Show on website: https://www.toggl.com/app/reports/summary/%d/from/%s/to/%s\n", opts.WorkspaceId, start.Format("2006-01-02"), end.Format("2006-01-02"))
	// *entries = FilterEntriesForWorkspace(*entries, opts.WorkspaceId)

	return *entries, err
}

func (a *Api) GetActiveTimeEntry() (*TimeEntryDto, error) {
	resp := &TimeEntryDto{}
	_, err := a.httpClient.R().
		SetResult(resp).
		Get("/me/time_entries/current")

	if err != nil {
		return nil, err
	}

	if resp.ID == 0 {
		return nil, nil
	}

	return resp, nil
}

func (a *Api) StartTimeEntry(opts *CreateTypeEntryRequestDto) (*TimeEntryDto, error) {

	dto := &TimeEntryDto{}
	resp, err := a.httpClient.R().
		SetBody(CreateTypeEntryRequestDto{
			CreatedWith: "toggl-cli",
			Start:       opts.Start,
			WorkspaceID: opts.WorkspaceID,
			ProjectID:   opts.ProjectID,
			Duration:    opts.Duration,
			Description: opts.Description,
		}).
		SetResult(dto).
		Post(fmt.Sprintf("/workspaces/%d/time_entries", opts.WorkspaceID))

	debugPrintResponse(resp)

	return dto, err
}

func (a *Api) StopTimeEntry(entry *TimeEntryDto) (*TimeEntryDto, error) {
	resp := &TimeEntryDto{}
	_, err := a.httpClient.R().
		SetResult(resp).
		Patch(fmt.Sprintf("/workspaces/%d/time_entries/%d/stop", entry.WorkspaceId, entry.ID))
	return resp, err
}

func debugPrintResponse(resp *resty.Response) {
	fmt.Println("Response Info:")
	fmt.Println("Error      :", resp.Error())
	fmt.Println("Status Code:", resp.StatusCode())
	fmt.Println("Status     :", resp.Status())
	fmt.Println("Time       :", resp.Time())
	fmt.Println("Received At:", resp.ReceivedAt())
	fmt.Println("Body       :\n", resp)
	fmt.Println()
}

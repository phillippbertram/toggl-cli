package start

import (
	"fmt"
	"time"

	"github.com/AlecAivazis/survey/v2"
	"github.com/MakeNowJust/heredoc"
	"github.com/spf13/cobra"
	"phillipp.io/toggl-cli/internal/api"
	"phillipp.io/toggl-cli/internal/utils"
)

// Define the API token flag
type StartTrackingOpts struct {
	api *api.Api

	apiToken       string
	projectName    string
	description    string
	force          bool
	chooseFromPast bool
}

func NewCmdStart() *cobra.Command {

	opts := StartTrackingOpts{}

	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start tracking time for a project",
		Example: heredoc.Doc(`
			$ tgl start
			$ tgl start -p "Project Name" -d "Description"
			$ tgl start -p "Project Name" -d "Description" --force
			$ tgl start -l
		`),
		RunE: func(cmd *cobra.Command, args []string) error {
			err := utils.GetApiToken(cmd, &opts.apiToken)
			if err != nil {
				return err
			}

			opts.api = api.NewApi(api.ApiOpts{ApiToken: opts.apiToken})

			return startTrackingRun(&opts)
		},
	}
	// TODO: ideas
	// tgl start # interactive move
	// tgl start -p "Project Name" -d "Description" # start a new time entry
	// tgl start -p "Project Name" -d "Description" --force # start a new time entry, even if there is already an active one
	// tgl start -l # choose from the last time entries
	// tgl start -l # empty time entry

	cmd.Flags().StringVarP(&opts.projectName, "project", "p", "", "Project Name to start tracking time for")
	cmd.Flags().StringVarP(&opts.description, "description", "d", "", "Description of the time entry")
	cmd.Flags().BoolVarP(&opts.force, "force", "f", false, "Force the start of a new time entry")
	cmd.Flags().BoolVarP(&opts.chooseFromPast, "last", "l", false, "Choose from the last time entries")

	return cmd
}

func startTrackingRun(opts *StartTrackingOpts) error {

	activeEntry, _ := opts.api.GetActiveTimeEntry()
	if activeEntry != nil && !opts.force {
		return fmt.Errorf("there is already an active time entry. Use --force to override")
	}

	if opts.chooseFromPast {
		return startIneractive(opts)
	} else {
		return startNewTimeEntry(opts)
	}

}

func startIneractive(opts *StartTrackingOpts) error {
	// prompt user for existing time entries using survey

	now := time.Now()
	latestEntries, err := opts.api.GetTimeEntries(&api.GetTimeEntriesOpts{
		Before: &now,
	})
	if err != nil {
		return err
	}

	entryTitles := make([]string, len(latestEntries))
	for i, entry := range latestEntries {
		description := "-"
		if entry.Description != nil {
			description = *entry.Description
		}
		if description == "" {
			description = "-"
		}

		entryTitles[i] = description
	}

	prompt := &survey.Select{
		Message: "Choose a time entry to start tracking",
		Options: entryTitles,
	}

	var selectedIndex int
	err = survey.AskOne(prompt, &selectedIndex)
	if err != nil {
		return err
	}

	selectedEntry := latestEntries[selectedIndex]
	startTime := now.Format("2006-01-02T15:04:05-07:00")

	entry, err := opts.api.StartTimeEntry(&api.CreateTypeEntryRequestDto{
		ProjectID:   selectedEntry.ProjectId,
		WorkspaceID: selectedEntry.WorkspaceId,
		Start:       startTime,
		Description: *selectedEntry.Description,
		Duration:    -1, // -1 means the entry is still running
	})

	fmt.Printf("Started time entry %+v\n", entry)
	return err
}

func startNewTimeEntry(opts *StartTrackingOpts) error {
	// TODO: get workspace ID from opts
	var workspaceID *int
	if workspaceID == nil {
		user, err := opts.api.GetMe()
		if err != nil {
			return err
		}
		workspaceID = &user.DefaultWorkspaceID
	}

	var projectID *int
	if opts.projectName != "" {
		project, err := opts.api.GetProjectByName(*workspaceID, opts.projectName)
		if err != nil {
			return err
		}
		projectID = &project.ID
	}

	now := time.Now()
	startTime := now.Format("2006-01-02T15:04:05-07:00")

	entry, err := opts.api.StartTimeEntry(&api.CreateTypeEntryRequestDto{
		ProjectID:   projectID,
		WorkspaceID: *workspaceID,
		Start:       startTime,
		Description: opts.description,
		Duration:    -1, // -1 means the entry is still running
	})

	fmt.Printf("Started time entry %+v\n", entry)
	return err
}

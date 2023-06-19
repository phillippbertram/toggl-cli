package utils

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

func GetFirstDayOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month, 1, 0, 0, 0, 0, now.Location())
}

func GetLastDayOfMonth() time.Time {
	now := time.Now()
	year, month, _ := now.Date()
	return time.Date(year, month+1, 0, 0, 0, 0, 0, now.Location())
}

func GetApiToken(cmd *cobra.Command, bindToken *string) error {
	token, err := cmd.Flags().GetString("token")
	if err != nil {
		return err
	}

	if token == "" {
		token = os.Getenv("TOGGL_API_TOKEN")
	}

	if token == "" {
		return fmt.Errorf("no API token provided")
	}

	*bindToken = token
}

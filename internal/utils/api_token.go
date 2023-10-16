package utils

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

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
	return nil
}
